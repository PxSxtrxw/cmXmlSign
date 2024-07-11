const http = require('http');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const xmlsign = require('facturacionelectronicapy-xmlsign').default || require('facturacionelectronicapy-xmlsign');
const xmlParser = require('xml-js');
const dotenv = require('dotenv');
const { infoLogger, errorLogger } = require('./logger');

dotenv.config();

const PORT = 3002;
const HOST = 'localhost';

const signedXMLFolderPath = path.join(__dirname, 'output');

if (!fs.existsSync(signedXMLFolderPath)) {
    fs.mkdirSync(signedXMLFolderPath);
}

function handleXMLRequest(req, res, xmlString) {
    const certPath = process.env.CERT_PATH;
    const password = process.env.PASSWORD;

    if (!fs.existsSync(certPath)) {
        const errorMessage = 'Invalid certPath, certificate file does not exist';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
        errorLogger.error(errorMessage);
        return;
    }

    try {
        const p12Content = fs.readFileSync(certPath, 'binary');
        const p12Asn1 = forge.asn1.fromDer(p12Content);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

        let privateKeyPem = null;
        let certPem = null;
        let cert = null;
        p12.safeContents.forEach(safeContents => {
            safeContents.safeBags.forEach(safeBag => {
                if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) {
                    if (safeBag.key) {
                        privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
                    }
                } else if (safeBag.type === forge.pki.oids.certBag) {
                    if (safeBag.cert) {
                        certPem = forge.pki.certificateToPem(safeBag.cert);
                        cert = safeBag.cert;
                    }
                }
            });
        });

        if (!privateKeyPem || !certPem) {
            const errorMessage = 'No se pudo encontrar la clave privada o el certificado en el archivo PKCS12.';
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage);
            return;
        }

        const certInfo = {
            subject: cert.subject.attributes.map(attr => `${attr.name}=${attr.value}`).join(', '),
            issuer: cert.issuer.attributes.map(attr => `${attr.name}=${attr.value}`).join(', '),
            validFrom: cert.validity.notBefore,
            validTo: cert.validity.notAfter
        };

        console.log("Información del certificado:");
        console.log(`- Asunto: ${certInfo.subject}`);
        console.log(`- Emisor: ${certInfo.issuer}`);
        console.log(`- Válido desde: ${certInfo.validFrom}`);
        console.log(`- Válido hasta: ${certInfo.validTo}`);

        infoLogger.info(`Certificate Information:\nSubject: ${certInfo.subject}\nIssuer: ${certInfo.issuer}\nValid From: ${certInfo.validFrom}\nValid To: ${certInfo.validTo}`);

        const expirationDate = new Date(cert.validity.notAfter);
        const now = new Date();

        if (now > expirationDate) {
            const errorMessage = `The expiration date (${expirationDate.toISOString()}) has passed.`;
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage);
            return;
        }

        xmlsign.signXML(xmlString, certPath, password)
        .then(xmlFirmado => {
            const xmlDoc = xmlParser.xml2js(xmlString, { compact: true });
            let dCdCDERefValue;

            if (xmlDoc.rDE && xmlDoc.rDE.DE && xmlDoc.rDE.DE.gCamDEAsoc && xmlDoc.rDE.DE.gCamDEAsoc.dCdCDERef) {
                dCdCDERefValue = xmlDoc.rDE.DE.gCamDEAsoc.dCdCDERef._text;
            } else {
                const errorMessage = 'Missing dCdCDERef element in the original XML';
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage }));
                errorLogger.error(errorMessage);
                return;
            }

            const filename = `signed-${padCdc(dCdCDERefValue)}.xml`;

            const filePath = path.join(signedXMLFolderPath, filename);
            // Dentro de la función fs.writeFile(), después de guardar el archivo
            fs.writeFile(filePath, xmlFirmado, (err) => {
                if (err) {
                    const errorMessage = 'Error saving signed XML';
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: errorMessage }));
                    errorLogger.error(errorMessage, { error: err });
                    return;
                }

                // Mostrar el XML firmado que realmente se guardó
                fs.readFile(filePath, 'utf8', (err, fileContent) => {
                    if (err) {
                        const errorMessage = 'Error reading signed XML file';
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: errorMessage }));
                        errorLogger.error(errorMessage, { error: err });
                        return;
                    }

                    console.log("Signed XML:");
                    console.log(fileContent); // Mostrar el contenido leído del archivo

                    infoLogger.info(`Signed XML:\n${fileContent}`);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'XML received and signed successfully', xml: fileContent, certInfo }));
                });
            });

        })
        .catch(error => {
            const errorMessage = `Error signing XML: ${error.message}`;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage, { error });
        });
    } catch (error) {
        console.error('Error incorrecto', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error incorrecto' }));
        errorLogger.error('Error incorrecto', { error });
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        if (req.headers['content-type'] === 'application/xml' || req.headers['content-type'] === 'text/xml') {
            let xmlString = '';

            req.on('data', chunk => {
                xmlString += chunk.toString();
            });

            req.on('end', () => {
                handleXMLRequest(req, res, xmlString);
            });
        } else {
            const errorMessage = 'Unsupported Content-Type, expected application/xml or text/xml';
            res.writeHead(415, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage);
        }
    } else {
        const errorMessage = `Unsupported method ${req.method}, expected POST`;
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
        errorLogger.error(errorMessage);
    }
});

// Función auxiliar para completar dCdCDERef a un tamaño fijo (si es necesario)
function padCdc(cdc) {
    const fixedLength = 5; // Definir la longitud fija que deseas
    return cdc.toString().padStart(fixedLength, '0'); // Completar con ceros a la izquierda
}


server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});
