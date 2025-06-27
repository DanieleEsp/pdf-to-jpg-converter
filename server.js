const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const pdf2pic = require('pdf2pic');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configurar multer para archivos temporales
const upload = multer({ 
    dest: 'temp/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB límite
});

// Crear directorio temporal si no existe
if (!fs.existsSync('temp')) {
    fs.mkdirSync('temp');
}

if (!fs.existsSync('output')) {
    fs.mkdirSync('output');
}

// Función para convertir PDF base64 a JPG
async function convertPdfToJpg(base64Data, options = {}) {
    try {
        // Remover el prefijo data:application/pdf;base64, si existe
        const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, '');
        
        // Convertir base64 a buffer
        const pdfBuffer = Buffer.from(base64Clean, 'base64');
        
        // Crear archivo temporal
        const tempPdfPath = path.join('temp', `temp_${Date.now()}.pdf`);
        fs.writeFileSync(tempPdfPath, pdfBuffer);
        
        // Configurar pdf2pic
        const convert = pdf2pic.fromPath(tempPdfPath, {
            density: options.density || 300, // DPI
            saveFilename: "page",
            savePath: "./temp/",
            format: "jpg",
            width: options.width || 2000,
            height: options.height || 2000
        });
        
        // Convertir todas las páginas
        const results = await convert.bulk(-1, true);
        
        const jpgImages = [];
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            
            if (result.path) {
                // Leer la imagen generada
                let imageBuffer = fs.readFileSync(result.path);
                
                // Optimizar con Sharp si es necesario
                if (options.optimize !== false) {
                    imageBuffer = await sharp(imageBuffer)
                        .jpeg({ 
                            quality: options.quality || 85,
                            progressive: true 
                        })
                        .toBuffer();
                }
                
                // Convertir a base64
                const base64Image = imageBuffer.toString('base64');
                
                jpgImages.push({
                    page: i + 1,
                    base64: `data:image/jpeg;base64,${base64Image}`,
                    size: imageBuffer.length
                });
                
                // Limpiar archivo temporal de imagen
                fs.unlinkSync(result.path);
            }
        }
        
        // Limpiar archivo temporal PDF
        fs.unlinkSync(tempPdfPath);
        
        return jpgImages;
        
    } catch (error) {
        console.error('Error convirtiendo PDF:', error);
        throw error;
    }
}

// Endpoint principal para conversión
app.post('/convert', async (req, res) => {
    try {
        const { base64, options = {} } = req.body;
        
        if (!base64) {
            return res.status(400).json({ 
                error: 'Se requiere el campo base64 con los datos del PDF' 
            });
        }
        
        console.log('Iniciando conversión...');
        const startTime = Date.now();
        
        const images = await convertPdfToJpg(base64, options);
        
        const endTime = Date.now();
        console.log(`Conversión completada en ${endTime - startTime}ms`);
        
        res.json({
            success: true,
            totalPages: images.length,
            processingTime: endTime - startTime,
            images: images
        });
        
    } catch (error) {
        console.error('Error en endpoint /convert:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor',
            message: error.message 
        });
    }
});

// Endpoint para conversión con archivo upload
app.post('/convert-file', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'Se requiere un archivo PDF' 
            });
        }
        
        // Leer archivo y convertir a base64
        const pdfBuffer = fs.readFileSync(req.file.path);
        const base64 = pdfBuffer.toString('base64');
        
        const options = req.body.options ? JSON.parse(req.body.options) : {};
        
        const images = await convertPdfToJpg(base64, options);
        
        // Limpiar archivo temporal
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            totalPages: images.length,
            images: images
        });
        
    } catch (error) {
        console.error('Error en endpoint /convert-file:', error);
        
        // Limpiar archivo si existe
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            error: 'Error interno del servidor',
            message: error.message 
        });
    }
});

// Endpoint de salud
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Endpoint de información
app.get('/', (req, res) => {
    res.json({
        service: 'PDF to JPG Converter',
        version: '1.0.0',
        endpoints: {
            'POST /convert': 'Convierte PDF base64 a imágenes JPG',
            'POST /convert-file': 'Convierte archivo PDF a imágenes JPG',
            'GET /health': 'Estado del servicio'
        },
        example: {
            method: 'POST',
            url: '/convert',
            body: {
                base64: 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAov...',
                options: {
                    density: 300,
                    quality: 85,
                    width: 2000,
                    height: 2000,
                    optimize: true
                }
            }
        }
    });
});

// Manejo de errores global
app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    res.status(500).json({ 
        error: 'Error interno del servidor' 
    });
});

// Limpiar archivos temporales al iniciar
function cleanTempFiles() {
    const tempDir = './temp';
    if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            if (fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
            }
        });
        console.log('Archivos temporales limpiados');
    }
}

// Limpiar archivos temporales cada hora
setInterval(cleanTempFiles, 60 * 60 * 1000);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    console.log(`API disponible en: http://localhost:${PORT}`);
    cleanTempFiles();
});
