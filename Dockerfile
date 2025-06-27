# Usar imagen base de Node.js con dependencias del sistema
FROM node:18-bullseye

# Instalar dependencias del sistema necesarias para pdf2pic y sharp
RUN apt-get update && apt-get install -y \
    ghostscript \
    imagemagick \
    poppler-utils \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Configurar ImageMagick para permitir PDFs
RUN sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de Node.js
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Crear directorios necesarios
RUN mkdir -p temp output

# Exponer puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]
