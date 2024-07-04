const http = require('http');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { parseString } = require('xml2js');
const xmlsign = require('facturacionelectronicapy-xmlsign').default || require('facturacionelectronicapy-xmlsign');
const { createLogger, transports, format } = require('winston');

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

// Ruta al certificado y contraseña
const certificadoPath = path.join('C:', 'Pasantia 2024 CM-Sistemas', 'Tarea 3', 'Certificado.p12');
const password = 'HolaMundo';

// Ruta de la carpeta donde se guardarán los XML firmados
const signedXMLFolderPath = path.join('C:', 'Pasantia 2024 CM-Sistemas', 'Tarea 3', 'signed_xmls');

// Verificar que el certificado existe
if (!fs.existsSync(certificadoPath)) {
    console.error('El archivo de certificado no existe:', certificadoPath);
    process.exit(1);
}

// Verificar que la carpeta de XML firmados existe, si no, crearla
if (!fs.existsSync(signedXMLFolderPath)) {
    fs.mkdirSync(signedXMLFolderPath);
}

const requestHandler = (req, res) => {
    if (req.method === 'POST' && req.headers['content-type'] === 'application/xml') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            parseString(body, (err) => {
                if (err) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Invalid XML');
                    errorLogger.error('Invalid XML received');
                    return;
                }

                // Limpieza y validación del XML recibido
                let xmlString;
                try {
                    xmlString = iconv.decode(Buffer.from(body), 'utf-8').replace(/^\uFEFF/, ''); // Elimina el BOM si está presente

                    // Validar la declaración XML
                    const xmlDeclarationRegex = /^<\?xml version="1\.0" encoding="UTF-8"( standalone="no")?\?>/;
                    if (!xmlDeclarationRegex.test(xmlString)) {
                        res.writeHead(400, { 'Content-Type': 'text/plain' });
                        res.end('Invalid XML declaration');
                        errorLogger.error('Invalid XML declaration');
                        return;
                    }

                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error reading XML');
                    errorLogger.error('Error reading received XML', { error: err });
                    return;
                }

                // Firmar el XML
                xmlsign
                    .signXML(xmlString, certificadoPath, password)
                    .then(xmlFirmado => {
                        const formattedXml = xmlFirmado.replace(/\n/g, '');
                        infoLogger.info(`Signed XML: ${formattedXml}`);

                        // Generar un nuevo nombre de archivo único para el XML firmado
                        const outputFileName = `signed_${Date.now()}.xml`;
                        const outputPath = path.join(signedXMLFolderPath, outputFileName);

                        // Guardar el XML firmado en la carpeta especificada
                        fs.writeFile(outputPath, xmlFirmado, (err) => {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'text/plain' });
                                res.end('Error saving signed XML');
                                errorLogger.error('Error saving signed XML', { error: err });
                                return;
                            }
                            res.writeHead(200, { 'Content-Type': 'text/plain' });
                            res.end('XML received and signed successfully');
                            infoLogger.info(`Signed XML saved successfully at ${outputPath}`);
                        });
                    })
                    .catch(error => {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Error signing XML');
                        errorLogger.error("Error signing XML", { error });
                    });
            });
        });
    } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid request');
        errorLogger.error('Invalid request received');
    }
};

const server = http.createServer(requestHandler);

server.listen(PORT, HOST, (err) => {
    if (err) {
        return errorLogger.error('Error starting server', { error: err });
    }
    infoLogger.info(`Server is listening at http://${HOST}:${PORT}`);
});
