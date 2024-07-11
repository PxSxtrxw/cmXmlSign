const { createLogger, transports, format } = require('winston');
const fs = require('fs');
const path = require('path');

// Directorio donde se guardarán los archivos de log
const logDirectory = path.join(__dirname, 'logs');

// Verificar que el directorio de logs exista, si no, crearlo
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

// Formato personalizado para los logs
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

// Configuración del logger de eventos (info)
const infoLogger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        customFormat
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: path.join(logDirectory, 'eventLogger.log'), level: 'info', maxsize: 5242880, maxFiles: 5 }) // 5MB por archivo, máximo 5 archivos
    ]
});

// Configuración del logger de errores
const errorLogger = createLogger({
    level: 'error',
    format: format.combine(
        format.timestamp(),
        customFormat
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: path.join(logDirectory, 'errorLogger.log'), level: 'error', maxsize: 5242880, maxFiles: 5 }) // 5MB por archivo, máximo 5 archivos
    ]
});

module.exports = { infoLogger, errorLogger };
