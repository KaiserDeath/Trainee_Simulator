FROM node:18-alpine
WORKDIR /app
# Copia los archivos de configuración de dependencias
COPY package*.json ./
RUN npm install
# Copia absolutamente todo el contenido de la carpeta backend (incluyendo la carpeta src)
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
