const http = require('http');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { parseString } = require('xml2js');
const xmlsign = require('facturacionelectronicapy-xmlsign').default || require('facturacionelectronicapy-xmlsign');
const xmlParser = require('xml-js');
const { infoLogger, errorLogger } = require('./logger'); // Importar los loggers configurados

const PORT = 3002;
const HOST = 'localhost';

// Ruta de la carpeta donde se guardarán los XML firmados
const signedXMLFolderPath = path.join(__dirname, 'output');

// Verificar que la carpeta de XML firmados existe, si no, crearla
if (!fs.existsSync(signedXMLFolderPath)) {
    fs.mkdirSync(signedXMLFolderPath);
}

// Función para manejar solicitudes XML
function handleXMLRequest(req, res, xmlString, certPath, password) {
    // Validar la existencia de certPath
    if (!fs.existsSync(certPath)) {
        const errorMessage = 'Invalid certPath, certificate file does not exist';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
        errorLogger.error(errorMessage);
        return;
    }

    // Leer el certificado y la clave privada
    try {
        const p12Content = fs.readFileSync(certPath, 'binary');
        const p12Asn1 = forge.asn1.fromDer(p12Content);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

        // Obtener clave privada y certificado
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

        // Mostrar información del certificado en la consola
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

        // Registrar la información del certificado en el logger
        infoLogger.info(`Certificate Information:\nSubject: ${certInfo.subject}\nIssuer: ${certInfo.issuer}\nValid From: ${certInfo.validFrom}\nValid To: ${certInfo.validTo}`);

        // Verificar validez del certificado
        const now = new Date();
        if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
            const errorMessage = 'Certificado no válido o vencido';
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage);
            return;
        }

        // Aquí se añade la verificación de la fecha de validez especificada
        const expirationDate = new Date(cert.validity.notAfter);
        if (now > expirationDate) {
            const errorMessage = `The expiration date (${expirationDate.toISOString()}) has passed.`;
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage);
            return;
        }

        xmlsign.signXML(xmlString, certPath, password)
        .then(xmlFirmado => {
            // Parsear el string XML para obtener dCdCDERef
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

            // Construir el nombre del archivo usando dCdCDERef
            const filename = `signed-${padCdc(dCdCDERefValue)}.xml`; // Ejemplo: "signed-ValorDcdCDERef.xml"

            // Guardar el XML firmado en la carpeta especificada con el nombre generado
            const filePath = path.join(signedXMLFolderPath, filename);
            fs.writeFile(filePath, xmlFirmado, (err) => {
                if (err) {
                    const errorMessage = 'Error saving signed XML';
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: errorMessage }));
                    errorLogger.error(errorMessage, { error: err });
                    return;
                }

                // Mostrar el XML firmado por consola
                console.log("XML firmado guardado:", filePath);

                // Responder con el nombre del archivo firmado
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ filename }));
            });
        })
        .catch(error => {
            const errorMessage = 'Error signing XML';
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage, { error });
        });

    } catch (err) {
        const errorMessage = 'Error reading PKCS12 file';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
        errorLogger.error(errorMessage, { error: err });
    }
}

// Función para rellenar con ceros a la izquierda el valor de dCdCDERef
function padCdc(value) {
    return value.padStart(10, '0');
}

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    if (req.method === 'POST') { 
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const { xmlString, certPath, password } = JSON.parse(body);

                // Manejar solicitud XML
                handleXMLRequest(req, res, xmlString, certPath, password);
            } catch (error) {
                const errorMessage = 'Invalid JSON payload';
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage }));
                errorLogger.error(errorMessage, { error });
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }
});


// Iniciar el servidor
server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});
