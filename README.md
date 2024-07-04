# cmXmlSing (Firma de XML para la SET)

Este repositorio contiene una extensión para la firma de archivos XML necesarios para la comunicación con la SET (Subsecretaría de Estado de Tributación del Ministerio de Hacienda) de Paraguay. El código está diseñado para firmar archivos xml anteriormente generados.

## Requerimientos

Para utilizar este código, es necesario tener instalado:

- Node.js
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
npm install iconv-lite
```
```bash
npm install fs
```
## Configuración

Antes de ejecutar el servidor, asegúrese de configurar adecuadamente los parámetros y datos necesarios según la documentación de la SET. Los datos del archivo XML deve de cumplir con los requisitos necesarios para poder ser firmado, hay mas informacion sobre la generacion de archivos XML en este repositorio (cmXmlGen)[https://github.com/PxSxtrxw/cmXmlGen].

## Uso

### Ejecución del Servidor

Para iniciar el servidor de desarrollo, use el siguiente comando:

```bash
node server
```
El servidor se iniciará en http://localhost:3001.

### Estructura Devuelta 

El servidor guardara automaticamente en una carpeta generada llamada `signed_xmls` y en esta se creara un archivo con un nombre en especifico para cada archivo XML firmado devuelto por el servidor

### Logger

el servidor guardara la actividad de errores en `error.log` y la informacion de toda la actividad del servidor en `info.log`



