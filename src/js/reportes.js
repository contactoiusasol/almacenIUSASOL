// reportes.js - Script corregido para visualización de entradas

// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let charts = {};
let currentReportData = null;

// ------------------- HELPERS MEJORADOS -------------------
function getField(record, candidates = []) {
  if (!record) return undefined;
  const keys = Object.keys(record);
  
  for (const cand of candidates) {
    const lowerCand = cand.toLowerCase();
    const foundKey = keys.find(k => k.toLowerCase() === lowerCand);
    if (foundKey) return record[foundKey];
  }
  
  for (const cand of candidates) {
    const lowerCand = cand.toLowerCase();
    const foundKey = keys.find(k => k.toLowerCase().includes(lowerCand));
    if (foundKey) return record[foundKey];
  }
  
  return undefined;
}

function getRecordDate(record) {
  if (!record) return null;
  const possible = ['fecha', 'FECHA', 'fecha_entrada', 'FECHA_ENTRADA', 'created_at', 'FECHA_SALIDA', 'fecha_salida'];
  
  for (const f of possible) {
    const val = getField(record, [f]);
    if (!val) continue;
    
    if (val instanceof Date && !isNaN(val.getTime())) {
      const d = val;
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    
    const s = String(val).trim();
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return null;
}

function isDateInRange(dateIsoString, startIsoString, endIsoString) {
  try {
    if (!dateIsoString) return false;
    const d = new Date(dateIsoString);
    const start = new Date(startIsoString);
    const end = new Date(endIsoString);
    d.setHours(0,0,0,0);
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    return d >= start && d <= end;
  } catch (e) {
    return false;
  }
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  let s = String(value).trim().replace(/[^\d.,]/g, '');
  if (s === '') return 0;
  
  const hasDot = s.indexOf('.') !== -1;
  const hasComma = s.indexOf(',') !== -1;
  
  try {
    if (hasDot && hasComma) {
      if (s.indexOf(',') < s.indexOf('.')) {
        s = s.replace(/,/g,'');
        return parseFloat(s) || 0;
      }
      s = s.replace(/\./g,'').replace(',', '.');
      return parseFloat(s) || 0;
    } else if (hasComma && !hasDot) {
      s = s.replace(',', '.');
      return parseFloat(s) || 0;
    } else {
      return parseFloat(s) || 0;
    }
  } catch (e) {
    return 0;
  }
}

// ------------------- DIAGNÓSTICO RÁPIDO -------------------
async function diagnosticarEstructuraCompleta() {
  console.log("🔍 DIAGNÓSTICO RÁPIDO");
  
  // Productos
  try {
    const { data } = await supabase.from('productos').select('*').limit(1);
    if (data && data[0]) {
      console.log("✅ PRODUCTOS - Campos:", Object.keys(data[0]));
      console.log("   Ejemplo:", { 
        CODIGO: data[0].CODIGO, 
        DESCRIPCION: data[0].DESCRIPCION,
        INVENTARIO: data[0]['INVENTARIO FISICO EN ALMACEN'] 
      });
    }
  } catch (e) { console.error("❌ Productos:", e.message); }

  // Entradas
  try {
    const { data } = await supabase.from('entradas').select('*').limit(1);
    if (data && data[0]) {
      console.log("✅ ENTRADAS - Campos:", Object.keys(data[0]));
      console.log("   Ejemplo:", { 
        codigo: data[0].codigo, 
        cantidad: data[0].cantidad,
        fecha: data[0].fecha 
      });
    }
  } catch (e) { console.error("❌ Entradas:", e.message); }

  // Salidas
  try {
    const { data } = await supabase.from('salidas').select('*').limit(1);
    if (data && data[0]) {
      console.log("✅ SALIDAS - Campos:", Object.keys(data[0]));
      console.log("   Ejemplo:", { 
        CODIGO: data[0].CODIGO, 
        CANTIDAD_SALIDA: data[0].CANTIDAD_SALIDA,
        FECHA_SALIDA: data[0].FECHA_SALIDA 
      });
    }
  } catch (e) { console.error("❌ Salidas:", e.message); }
}

// ------------------- INICIALIZACIÓN -------------------
document.addEventListener('DOMContentLoaded', function() {
  console.log("🚀 Inicializando reportes...");
  initializeYearSelect();
  setupEventListeners();
  setTimeout(() => diagnosticarEstructuraCompleta(), 500);
  loadCurrentMonthReport();
});

function initializeYearSelect() {
  const yearSelect = document.getElementById('yearSelect');
  if (!yearSelect) return;
  const currentYear = new Date().getFullYear();
  yearSelect.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 5; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = currentYear;
  const monthElem = document.getElementById('monthSelect');
  if (monthElem) monthElem.value = new Date().getMonth() + 1;
}

function setupEventListeners() {
  const generateBtn = document.getElementById('generateReport');
  const exportBtn = document.getElementById('exportReport');
  if (generateBtn) generateBtn.addEventListener('click', generateReport);
  if (exportBtn) exportBtn.addEventListener('click', exportToPDF);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() { 
      switchTab(this.dataset.tab); 
    });
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const btn = document.querySelector(`[data-tab="${tabName}"]`);
  const tab = document.getElementById(`${tabName}Tab`);
  if (btn) btn.classList.add('active');
  if (tab) tab.classList.add('active');
}

// ------------------- GENERAR REPORTE -------------------
async function generateReport() {
  console.log("🔍 Generando reporte...");
  showLoading(true);
  try {
    const month = parseInt(document.getElementById('monthSelect').value);
    const year = parseInt(document.getElementById('yearSelect').value);
    const reportData = await getMonthlyReport(month, year);
    if (reportData) {
      currentReportData = reportData;
      updateSummaryCards(reportData.summary);
      updateDetailedTable(reportData.detailed);
      updateMovementsTables(reportData.movements);
      generateCharts(reportData);
      console.log("✅ Reporte generado - Datos:", {
        productos: reportData.detailed.length,
        entradas: reportData.movements.entries.length,
        salidas: reportData.movements.exits.length
      });
    } else {
      alert("No se pudieron obtener datos para el reporte");
    }
  } catch (e) {
    console.error("❌ Error generando reporte:", e);
    alert("Error: " + e.message);
  } finally {
    showLoading(false);
  }
}

async function loadCurrentMonthReport() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const ms = document.getElementById('monthSelect');
  const ys = document.getElementById('yearSelect');
  if (ms) ms.value = month;
  if (ys) ys.value = year;
  await generateReport();
}

// ------------------- OBTENER DATOS CORREGIDO -------------------
async function getMonthlyReport(month, year) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
  console.log("📅 Rango:", startDate, "a", endDate);

  let products = [];
  let entradas = [];
  let salidas = [];

  // 1. OBTENER PRODUCTOS - CORREGIDO para estructura real
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('CODIGO');
    
    if (!error && data) {
      // Mapear a estructura consistente
      products = data.map(p => ({
        codigo: p.CODIGO,
        descripcion: p.DESCRIPCION,
        inventario_fisico: p['INVENTARIO FISICO EN ALMACEN'] || 0
      }));
      console.log(`📦 Productos mapeados: ${products.length}`);
    } else {
      console.error("Error productos:", error);
    }
  } catch (e) {
    console.error("Excepción productos:", e);
  }

  // 2. OBTENER ENTRADAS - CORREGIDO
  try {
    const { data, error } = await supabase
      .from('entradas')
      .select('*');
    
    if (!error && data) {
      // Filtrar por fecha
      entradas = data.filter(registro => {
        const fechaRegistro = getRecordDate(registro);
        const enRango = isDateInRange(fechaRegistro, startDate, endDate);
        return enRango;
      });
      console.log(`📥 Entradas obtenidas: ${entradas.length} (de ${data.length} totales)`);
      
      if (entradas.length > 0) {
        console.log("🔍 Ejemplo entrada:", {
          codigo: entradas[0].codigo,
          cantidad: entradas[0].cantidad,
          fecha: entradas[0].fecha,
          fechaParseada: getRecordDate(entradas[0])
        });
      }
    } else {
      console.error("Error entradas:", error);
    }
  } catch (e) {
    console.error("Excepción entradas:", e);
  }

  // 3. OBTENER SALIDAS - CORREGIDO
  try {
    const { data, error } = await supabase
      .from('salidas')
      .select('*');
    
    if (!error && data) {
      // Filtrar por fecha
      salidas = data.filter(registro => {
        const fechaRegistro = getRecordDate(registro);
        return isDateInRange(fechaRegistro, startDate, endDate);
      });
      console.log(`📤 Salidas obtenidas: ${salidas.length} (de ${data.length} totales)`);
    } else {
      console.error("Error salidas:", error);
    }
  } catch (e) {
    console.error("Excepción salidas:", e);
  }

  console.log(`📊 DATOS OBTENIDOS: ${products.length} productos, ${entradas.length} entradas, ${salidas.length} salidas`);
  
  return processReportData(products, entradas, salidas, month, year);
}

// ------------------- PROCESAR DATOS CORREGIDO -------------------
function processReportData(products, entradas, salidas, month, year) {
  console.log("🔄 Procesando datos...");
  
  const summary = { initialStock: 0, finalStock: 0, totalEntries: 0, totalExits: 0, stockDifference: 0 };
  const detailed = [];
  const movements = { entries: [], exits: [] };

  // Procesar cada producto
  products.forEach(prod => {
    const codigo = prod.codigo;

    // Buscar entradas de este producto
    const entradasProd = entradas.filter(e => e.codigo == codigo);
    
    // Buscar salidas de este producto
    const salidasProd = salidas.filter(s => s.CODIGO == codigo);

    // Calcular totales
    const totalEntradas = entradasProd.reduce((sum, e) => sum + parseNumber(e.cantidad), 0);
    const totalSalidas = salidasProd.reduce((sum, s) => sum + parseNumber(s.CANTIDAD_SALIDA), 0);
    
    const stockInicial = parseNumber(prod.inventario_fisico);
    const stockFinal = stockInicial + totalEntradas - totalSalidas;
    const diferencia = stockFinal - stockInicial;

    // Agregar a detallado
    detailed.push({
      codigo,
      descripcion: prod.descripcion,
      stockInicial,
      entradas: totalEntradas,
      salidas: totalSalidas,
      stockFinal,
      diferencia,
      tendencia: diferencia > 0 ? 'up' : diferencia < 0 ? 'down' : 'neutral'
    });

    // MOVIMIENTOS - ENTRADAS
    entradasProd.forEach(e => {
      movements.entries.push({
        fecha: e.fecha,
        codigo_producto: e.codigo,
        descripcion_producto: prod.descripcion,
        cantidad: parseNumber(e.cantidad),
        responsable: e.responsable || 'No especificado',
        observaciones: 'Entrada de inventario'
      });
    });

    // MOVIMIENTOS - SALIDAS  
    salidasProd.forEach(s => {
      movements.exits.push({
        fecha: s.FECHA_SALIDA,
        codigo_producto: s.CODIGO,
        descripcion_producto: s.DESCRIPCION,
        cantidad: parseNumber(s.CANTIDAD_SALIDA),
        responsable: s.RESPONSABLE || 'No especificado',
        destino: s.DESTINATARIO || '-',
        observaciones: s.OBSERVACIONES || ''
      });
    });

    // Sumar al resumen
    summary.initialStock += stockInicial;
    summary.finalStock += stockFinal;
  });

  // Calcular totales globales
  summary.totalEntries = movements.entries.reduce((sum, e) => sum + e.cantidad, 0);
  summary.totalExits = movements.exits.reduce((sum, e) => sum + e.cantidad, 0);
  summary.stockDifference = summary.finalStock - summary.initialStock;

  console.log("📈 RESUMEN:", summary);
  console.log("📋 DETALLADO:", detailed.length, "productos");
  console.log("🔄 MOVIMIENTOS - Entradas:", movements.entries.length, "Salidas:", movements.exits.length);

  return { summary, detailed, movements, month, year };
}

// ------------------- ACTUALIZAR UI -------------------
function updateSummaryCards(summary) {
  console.log("🔄 Actualizando resumen:", summary);
  
  const elements = {
    'initialStock': summary.initialStock,
    'finalStock': summary.finalStock,
    'totalEntries': summary.totalEntries,
    'totalExits': summary.totalExits
  };
  
  Object.keys(elements).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = Math.round(elements[id]).toLocaleString();
  });
  
  const diff = document.getElementById('stockDifference');
  if (diff) {
    diff.textContent = (summary.stockDifference > 0 ? '+' : '') + Math.round(summary.stockDifference).toLocaleString();
    diff.className = `card-value ${summary.stockDifference > 0 ? 'trend-up' : summary.stockDifference < 0 ? 'trend-down' : ''}`;
  }
}

function updateDetailedTable(detailed) {
  const tbody = document.getElementById('reportTableBody');
  if (!tbody) {
    console.error("❌ No se encuentra reportTableBody");
    return;
  }
  
  tbody.innerHTML = '';
  console.log("🔄 Actualizando tabla detallada con:", detailed.length, "registros");
  
  if (detailed.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay datos disponibles</td></tr>';
    return;
  }
  
  detailed.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.codigo}</td>
      <td>${item.descripcion}</td>
      <td>${Math.round(item.stockInicial).toLocaleString()}</td>
      <td>${Math.round(item.entradas).toLocaleString()}</td>
      <td>${Math.round(item.salidas).toLocaleString()}</td>
      <td>${Math.round(item.stockFinal).toLocaleString()}</td>
      <td class="${item.tendencia}">${item.diferencia > 0 ? '+' : ''}${Math.round(item.diferencia).toLocaleString()}</td>
      <td><span class="${item.tendencia}">${item.tendencia === 'up' ? '↗️' : item.tendencia === 'down' ? '↘️' : '➡️'}</span></td>
    `;
    tbody.appendChild(row);
  });
}

function updateMovementsTables(movements) {
  console.log("🔄 Actualizando tablas de movimientos:", {
    entradas: movements.entries.length,
    salidas: movements.exits.length
  });

  // TABLA DE ENTRADAS
  const entriesBody = document.getElementById('entriesTableBody');
  if (entriesBody) {
    entriesBody.innerHTML = '';
    
    if (movements.entries.length === 0) {
      entriesBody.innerHTML = '<tr><td colspan="6" class="text-center">No hay entradas registradas</td></tr>';
    } else {
      movements.entries.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${formatDate(entry.fecha)}</td>
          <td>${entry.codigo_producto}</td>
          <td>${entry.descripcion_producto}</td>
          <td>${Math.round(entry.cantidad).toLocaleString()}</td>
          <td>${entry.responsable}</td>
          <td>${entry.observaciones}</td>
        `;
        entriesBody.appendChild(row);
      });
    }
  } else {
    console.error("❌ No se encuentra entriesTableBody");
  }

  // TABLA DE SALIDAS
  const exitsBody = document.getElementById('exitsTableBody');
  if (exitsBody) {
    exitsBody.innerHTML = '';
    
    if (movements.exits.length === 0) {
      exitsBody.innerHTML = '<tr><td colspan="6" class="text-center">No hay salidas registradas</td></tr>';
    } else {
      movements.exits.forEach(exit => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${formatDate(exit.fecha)}</td>
          <td>${exit.codigo_producto}</td>
          <td>${exit.descripcion_producto}</td>
          <td>${Math.round(exit.cantidad).toLocaleString()}</td>
          <td>${exit.responsable}</td>
          <td>${exit.destino || exit.observaciones}</td>
        `;
        exitsBody.appendChild(row);
      });
    }
  } else {
    console.error("❌ No se encuentra exitsTableBody");
  }
}

function formatDate(dateString) {
  try {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('es-MX');
  } catch (e) {
    return dateString;
  }
}

// ------------------- GRÁFICOS -------------------
function generateCharts(reportData) {
  destroyExistingCharts();
  
  if (!reportData.detailed || reportData.detailed.length === 0) {
    showNoDataCharts();
    return;
  }
  
  generateMonthlyComparisonChart(reportData);
  generateProductMovementChart(reportData);
  generateTopProductsChart(reportData);
  generateEntriesExitsChart(reportData);
}

function showNoDataCharts() {
  const chartIds = ['monthlyComparisonChart', 'productMovementChart', 'topProductsChart', 'entriesExitsChart'];
  chartIds.forEach(chartId => {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts[chartId] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'] }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, title: { display: true, text: 'No hay datos' } }
      }
    });
  });
}

function destroyExistingCharts() {
  Object.values(charts).forEach(chart => chart && chart.destroy());
  charts = {};
}

function generateMonthlyComparisonChart(reportData) {
  const canvas = document.getElementById('monthlyComparisonChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  charts.comparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Stock Inicial', 'Stock Final'],
      datasets: [{
        label: 'Cantidad',
        data: [reportData.summary.initialStock, reportData.summary.finalStock],
        backgroundColor: ['#667eea', '#764ba2'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: 'Stock Inicial vs Final' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function generateProductMovementChart(reportData) {
  const canvas = document.getElementById('productMovementChart');
  if (!canvas) return;
  const topProducts = reportData.detailed.sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas)).slice(0, 8);
  const ctx = canvas.getContext('2d');
  charts.movement = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topProducts.map(p => p.codigo),
      datasets: [
        { label: 'Entradas', data: topProducts.map(p => p.entradas), backgroundColor: '#10b981' },
        { label: 'Salidas', data: topProducts.map(p => p.salidas), backgroundColor: '#ef4444' }
      ]
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: 'Movimiento por Producto (Top 8)' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function generateTopProductsChart(reportData) {
  const canvas = document.getElementById('topProductsChart');
  if (!canvas) return;
  const topProducts = reportData.detailed.sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas)).slice(0, 10);
  const ctx = canvas.getContext('2d');
  charts.topProducts = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: topProducts.map(p => p.descripcion.substring(0, 20) + (p.descripcion.length > 20 ? '...' : '')),
      datasets: [{
        data: topProducts.map(p => p.entradas + p.salidas),
        backgroundColor: ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'right' }, title: { display: true, text: 'Top 10 Productos' } }
    }
  });
}

function generateEntriesExitsChart(reportData) {
  const canvas = document.getElementById('entriesExitsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  charts.entriesExits = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Entradas', 'Salidas'],
      datasets: [{
        data: [reportData.summary.totalEntries, reportData.summary.totalExits],
        backgroundColor: ['#10b981', '#ef4444']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Entradas vs Salidas' } }
    }
  });
}

// ------------------- EXPORTAR PDF -------------------
async function exportToPDF() {
  if (!currentReportData) { alert('Primero genera un reporte'); return; }
  showLoading(true);
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text('Reporte de Inventario', 105, 15, { align: 'center' });
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    doc.text(`Período: ${monthNames[currentReportData.month-1]} ${currentReportData.year}`, 105, 25, { align: 'center' });
    doc.text('Resumen General', 20, 40);
    let y = 50;
    doc.text(`Stock Inicial: ${currentReportData.summary.initialStock.toLocaleString()}`, 20, y);
    doc.text(`Stock Final: ${currentReportData.summary.finalStock.toLocaleString()}`, 20, y+7);
    doc.text(`Entradas: ${currentReportData.summary.totalEntries.toLocaleString()}`, 20, y+14);
    doc.text(`Salidas: ${currentReportData.summary.totalExits.toLocaleString()}`, 20, y+21);
    doc.text(`Diferencia: ${currentReportData.summary.stockDifference.toLocaleString()}`, 20, y+28);
    doc.text('Detalle por Producto', 20, 90);
    const headers = ['Código','Descripción','Inicial','Entradas','Salidas','Final','Dif.'];
    let x = 20;
    headers.forEach(h => { doc.text(h, x, 100); x += 25; });
    y = 107;
    currentReportData.detailed.slice(0,30).forEach(item => {
      if (y > 270) { doc.addPage(); y = 20; }
      x = 20;
      doc.text(String(item.codigo), x, y);
      doc.text(String(item.descripcion).substring(0,15), x+25, y);
      doc.text(String(item.stockInicial), x+50, y);
      doc.text(String(item.entradas), x+75, y);
      doc.text(String(item.salidas), x+100, y);
      doc.text(String(item.stockFinal), x+125, y);
      doc.text(String(item.diferencia), x+150, y);
      y += 7;
    });
    doc.save(`reporte_${currentReportData.month}_${currentReportData.year}.pdf`);
  } catch (e) {
    console.error("Error PDF:", e);
    alert('Error al exportar');
  } finally {
    showLoading(false);
  }
}

// ------------------- UTILIDADES -------------------
function showLoading(show) {
  const ov = document.getElementById('loadingOverlay');
  if (ov) ov.style.display = show ? 'flex' : 'none';
}

// Debug functions
window.debugEntradas = async () => {
  const { data } = await supabase.from('entradas').select('*').limit(5);
  console.log("🔍 Últimas 5 entradas:", data);
  return data;
};

window.debugReport = () => console.log("📊 Reporte actual:", currentReportData);
window.diagnosticarEstructuraCompleta = diagnosticarEstructuraCompleta;