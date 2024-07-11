const { createLogger, transports, format } = require('winston');
const fs = require('fs');
const path = require('path');

// Ruta de la carpeta donde se guardarán los logs
const logFolder = path.join(__dirname, 'logs');

// Verificar que la carpeta de logs existe, si no, crearla
if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
}

// Configuración del formato personalizado para los logs
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

// Crear y exportar los loggers
const infoLogger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        customFormat
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: path.join(logFolder, 'eventLogger.log'), level: 'info', maxsize: 5242880, maxFiles: 5 }) // 5MB max size per file, 5 files max
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
        new transports.File({ filename: path.join(logFolder, 'errorLogger.log'), level: 'error', maxsize: 5242880, maxFiles: 5 }) // 5MB max size per file, 5 files max
    ]
});

module.exports = { infoLogger, errorLogger };
