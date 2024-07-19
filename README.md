# cmXmlSing (Firma de XML para la SET)

Este repositorio contiene una extensión para la firma de archivos XML necesarios para la comunicación con la SET (Subsecretaría de Estado de Tributación del Ministerio de Hacienda) de Paraguay. El código está diseñado para firmar archivos xml anteriormente generados.

## Requerimientos

Para utilizar este código, es necesario tener instalado:

- Node.js
- Java
- npm (Node Package Manager)

## Instalación

Para instalar las dependencias necesarias, ejecute el siguiente comando en la terminal:

```bash
npm install facturacionelectronicapy-xmlsign
```
```bash
npm install iconv-lite
```
```bash
npm install xml2js
```
```bash
npm install winston
```
```bash
npm install node-forge
```
```bash
npm install xml-js 
```
```bash
npm install  dotenv
```

## Configuración

Antes de ejecutar el servidor, asegúrese de configurar adecuadamente los parámetros y datos necesarios según la documentación de la SET. Los datos del archivo XML deve de cumplir con los requisitos necesarios para poder ser firmado, hay mas informacion sobre la generacion de archivos XML en este repositorio [cmXmlGen](https://github.com/PxSxtrxw/cmXmlGen).

## Uso

### Ejecución del Servidor

Para iniciar el servidor de desarrollo, use el siguiente comando:

```bash
node server
```
El servidor se iniciará en http://localhost:3002, el servidor tiene 2 formas de firmar los archivos XML:

- `/regular`: Firma las estructuras XML generadas con el metodo regular
- `/evento`: Firma las estructuras XML generadas con el cualquier otro metodo distinto al regular

Para obtener mas informacion de los metodos de las estructuras XML generada puede visitar el repositorio [cmXmlGen](https://github.com/PxSxtrxw/cmXmlGen)

## Guardado de Archivos

El servidor guardara automaticamente en una carpeta generada llamada `output` y en esta se creara un archivo con un nombre en especifico para cada archivo XML firmado devuelto por el servidor

## Verificar los Certificados con formato .p12

El servidor analizara si los certificados son validos y tambien mostrara por consola los datos del certificado

## Funcionamiento del Servidor HTTP

Al momento de ejecutar el archivo `server.js` se creara un servidor que estara escuchando una estructura Json con los parametros necesarios para Generar la firma en el XML en una solicitud POST y el servidor le dara una estructura XML con una firma integrada
Asegurate que la estructura Json cumpla con todos los parametros validos, los parametros de la estructura Json son: 

- `certPath`: Ruta al certificado.p12
- `password`: Contraseña del certificado .p12
- `xml`: XML generado Anteriormente

## Logger

el servidor guardara los loggers en una carpte llamada logs y la actividad de errores en `errorLogger.log` y la informacion de toda la actividad del servidor en `eventLogger.log`





