import dotenv from 'dotenv'; 
dotenv.config(); 
import app from './app.js'; 

// Cambiamos el respaldo a 8080 para que Back4App pase el Health Check con éxito
const PORT = process.env.PORT || 8080; 

app.listen(PORT, () => { 
  console.log(`Server running on port ${PORT}`); 
});
