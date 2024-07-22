const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { infoLogger, errorLogger } = require('./logger'); // Importar los loggers

require('dotenv').config(); 

// Obtiene la ruta del archivo .class desde las variables de entorno
const javaClassPath = process.env.JAVA_CLASS_PATH;

const eventTypes = {
    'canc': 'cancelacion',
    'inut': 'inutilizacion',
    'conf': 'conformidad',
    'disc': 'disconformidad',
    'desc': 'desconocimiento',
    'noti': 'notificacion'
};

if (!javaClassPath) {
    const errorMessage = 'Error: JAVA_CLASS_PATH no está definido en el archivo .env';
    errorLogger.error(errorMessage);
    throw new Error(errorMessage);
}

// Función para extraer el tipo de evento del nombre del archivo XML
const getEventTypeFromFileName = (fileName) => {
    const match = fileName.match(/xml-(\w{4})-/);
    return match ? match[1] : 'evento';
};

// Función para extraer los números del nombre del archivo XML
const getNumbersFromFileName = (fileName) => {
    const match = fileName.match(/-(\d+)\.xml$/);
    return match ? match[1] : '';
};

// Define la función para firmar el XML de evento
const handleEventXMLRequest = (xmlFilePath, certPath, password, eventType, callback) => {
    // Verificar si el tipo de evento existe en la lista
    if (!eventTypes[eventType]) {
        const errorMessage = `Tipo de evento '${eventType}' no existe.`;
        errorLogger.error(errorMessage);
        return callback(new Error(errorMessage));
    }

    infoLogger.info(`Tipo de evento proporcionado: ${eventTypes[eventType]}`);

    infoLogger.info(`Iniciando el proceso de firma para el archivo XML: ${xmlFilePath}`);

    if (!fs.existsSync(xmlFilePath)) {
        const errorMessage = `Invalid xmlFilePath: ${xmlFilePath} - XML file does not exist`;
        errorLogger.error(errorMessage);
        return callback(new Error(errorMessage));
    }
    infoLogger.info(`Archivo XML encontrado: ${xmlFilePath}`);

    if (!fs.existsSync(certPath)) {
        const errorMessage = `Invalid certPath: ${certPath} - Certificate file does not exist`;
        errorLogger.error(errorMessage);
        return callback(new Error(errorMessage));
    }
    infoLogger.info(`Archivo de certificado encontrado: ${certPath}`);

    const tempXmlPath = path.join(__dirname, 'temp-evento.xml');
    infoLogger.info(`Guardando el XML en el archivo temporal: ${tempXmlPath}`);
    const xmlString = fs.readFileSync(xmlFilePath, 'utf-8');
    fs.writeFileSync(tempXmlPath, xmlString);

    const command = `java -cp ${javaClassPath} SignXMLEvento "${tempXmlPath}" "${certPath}" "${password}"`;
    infoLogger.info(`Ejecutando el comando para firmar el XML: ${command}`);

    exec(command, (error, stdout, stderr) => {
        fs.unlinkSync(tempXmlPath);
        infoLogger.info(`Archivo temporal eliminado: ${tempXmlPath}`);

        if (error) {
            const errorMessage = `Error al ejecutar el comando: ${error.message}`;
            errorLogger.error(errorMessage);
            return callback(new Error(errorMessage));
        }
        if (stderr) {
            const errorMessage = `Error en stderr: ${stderr}`;
            errorLogger.error(errorMessage);
            return callback(new Error(errorMessage));
        }
        infoLogger.info(`Comando ejecutado exitosamente. Salida: ${stdout}`);

        const eventTypes = {
            'gene': 'generar',
            'canc': 'cancelacion',
            'inut': 'inutilizacion',
            'conf': 'conformidad',
            'disc': 'disconformidad',
            'desc': 'desconocimiento',
            'noti': 'notificacion'
        };

        const eventName = eventTypes[eventType] || 'desconocido';
        infoLogger.info(`Tipo de evento proporcionado: ${eventName}`);

        const numbers = getNumbersFromFileName(path.basename(xmlFilePath));
        infoLogger.info(`Números extraídos del nombre del archivo XML: ${numbers}`);

        const filename = `signed-${eventType}-${numbers}.xml`;
        const signedXMLFolderPath = path.join(__dirname, 'output');
        if (!fs.existsSync(signedXMLFolderPath)) {
            fs.mkdirSync(signedXMLFolderPath);
            infoLogger.info(`Carpeta de salida creada: ${signedXMLFolderPath}`);
        }

        const filePath = path.join(signedXMLFolderPath, filename);
        infoLogger.info(`Archivo firmado será guardado en: ${filePath}`);

        if (fs.existsSync(filePath)) {
            const infoMessage = `El archivo ${filename} ya existe. Contenido del XML:`;
            infoLogger.info(infoMessage);
            const existingContent = fs.readFileSync(filePath, 'utf-8');
            infoLogger.info(existingContent);
            return callback(new Error(`El archivo ${filename} ya existe.`));
        }

        fs.writeFile(filePath, stdout, (err) => {
            if (err) {
                const errorMessage = `Error saving signed XML: ${err.message}`;
                errorLogger.error(errorMessage);
                return callback(new Error(errorMessage));
            }

            const infoMessage = `Evento firmado exitosamente: ${eventName}`;
            infoLogger.info(infoMessage);

            callback(null, filename);
        });
    });
};

// Exportar la función para usarla en otros módulos
module.exports = { handleEventXMLRequest };
