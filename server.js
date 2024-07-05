const http = require('http');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { parseString } = require('xml2js');
const xmlsign = require('facturacionelectronicapy-xmlsign').default || require('facturacionelectronicapy-xmlsign');
const { createLogger, transports, format } = require('winston');
const xmlParser = require('xml-js');

const PORT = 3001;
const HOST = 'localhost';

// Configuración del logger
const customFormat = format.printf(info => {
    const separator = '-----------------------------------------------------------------------';
    let message = `${info.timestamp} - ${info.level.toUpperCase()} - ${separator}\n`;

    // Si el mensaje es un XML firmado, mostrarlo en una línea
    if (info.message.startsWith('Signed XML')) {
        message += `${info.message.split('\n').join(' ').trim()}\n`;
    } else {
        message += `${info.message}\n`;
    }

    message += `${separator}`;
    return message;
});

const infoLogger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        customFormat
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'info.log', level: 'info', maxsize: 5242880, maxFiles: 5 }) // 5MB max size per file, 5 files max
    ]
});

const errorLogger = createLogger({
    level: 'error',
    format: format.combine(
        format.timestamp(),
        customFormat
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'error.log', level: 'error', maxsize: 5242880, maxFiles: 5 }) // 5MB max size per file, 5 files max
    ]
});
// Ruta de la carpeta donde se guardarán los XML firmados
const signedXMLFolderPath = path.join('signed_xmls');

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
                console.log("Signed XML:");
                console.log(xmlFirmado);

                // Registrar el XML firmado en el logger
                infoLogger.info(`Signed XML:\n${xmlFirmado}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'XML received and signed successfully', xml: xmlFirmado, certInfo }));
            });
        })
        .catch(error => {
            const errorMessage = 'Error signing XML';
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage, { error });
        });
    } catch (error) {
        console.error('Error contraseña incorrecta:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error contraseña incorrecta:' }));
        errorLogger.error('Error contraseña incorrecta:', { error });
    }
}

// Función para manejar solicitudes JSON
function handleJSONRequest(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        let jsonData;
        try {
            jsonData = JSON.parse(body);
        } catch (error) {
            const errorMessage = 'Invalid JSON';
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage, { error });
            return;
        }

        // Verificar que los parámetros certPath y password existan en el JSON
        if (!jsonData.certPath || !jsonData.password) {
            const errorMessage = 'Missing certPath or password in JSON';
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage);
            return;
        }

        const { certPath, password, xmlString } = jsonData;
        handleXMLRequest(req, res, xmlString, certPath, password);
    });
}

// Crear el servidor HTTP
const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        if (req.headers['content-type'] === 'application/json') {
            handleJSONRequest(req, res);
        } else {
            const errorMessage = 'Unsupported Content-Type';
            res.writeHead(415, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errorMessage }));
            errorLogger.error(errorMessage);
        }
    } else {
        const errorMessage = 'Method Not Allowed';
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
        errorLogger.error(errorMessage);
    }
});

// Escuchar en el puerto definido
server.listen(PORT, HOST, () => {
    console.log(`Servidor escuchando en http://${HOST}:${PORT}`);
    infoLogger.info(`Servidor iniciado en http://${HOST}:${PORT}`);
});

// Función auxiliar para completar dCdCDERef a un tamaño fijo (si es necesario)
function padCdc(cdc) {
    const fixedLength = 5; // Definir la longitud fija que deseas
    return cdc.toString().padStart(fixedLength, '0'); // Completar con ceros a la izquierda
}
