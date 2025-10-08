const fs = require('fs-extra');
const path = require('path');

async function build() {
  try {
    // Crear carpeta dist si no existe
    await fs.ensureDir('dist');
    
    // Copiar todas las carpetas necesarias
    const foldersToCopy = ['html', 'img', 'js', 'styles', 'src'];
    
    for (const folder of foldersToCopy) {
      if (fs.existsSync(folder)) {
        await fs.copy(folder, path.join('dist', folder));
        console.log(`✅ Copiada carpeta: ${folder}`);
      }
    }
    
    console.log('🚀 Build completado exitosamente!');
  } catch (error) {
    console.error('❌ Error en build:', error);
    process.exit(1);
  }
}

build();