// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let charts = {};
let currentReportData = null;
let useCodes = true;


// ================== ALERTS (Toasts) & Confirm modal ==================
(function() {
  const container = () => {
    let c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  };

  function makeIcon(type) {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': default: return 'ℹ️';
    }
  }

  window.showAlert = function(message, type = 'info', options = {}) {
    const { title = '', duration = 4000, dismissible = true } = options;
    const c = container();

    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');

    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.innerText = makeIcon(type);

    const content = document.createElement('div');
    content.className = 'content';

    if (title) {
      const h = document.createElement('div');
      h.className = 'title';
      h.innerText = title;
      content.appendChild(h);
    }

    const p = document.createElement('div');
    p.innerText = message;
    content.appendChild(p);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.setAttribute('aria-label', 'Cerrar notificación');
    closeBtn.innerHTML = '&times;';

    closeBtn.addEventListener('click', () => {
      if (t.timeout) clearTimeout(t.timeout);
      t.remove();
    });

    t.appendChild(icon);
    t.appendChild(content);
    if (dismissible) t.appendChild(closeBtn);

    c.prepend(t);

    if (duration && duration > 0) {
      t.timeout = setTimeout(() => {
        t.remove();
      }, duration);
    }

    return t;
  };

  window.clearAlerts = function() {
    const c = container();
    c.innerHTML = '';
  };

  window.showConfirm = function(title = 'Confirmar', message = '¿Estás seguro?') {
    return new Promise(resolve => {
      const modal = document.getElementById('confirmModal');
      if (!modal) {
        const ok = window.confirm(message);
        resolve(ok);
        return;
      }
      const titleEl = document.getElementById('confirmTitle');
      const msgEl = document.getElementById('confirmMessage');
      const okBtn = document.getElementById('confirmOk');
      const cancelBtn = document.getElementById('confirmCancel');

      titleEl.innerText = title;
      msgEl.innerText = message;

      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');

      function cleanup(result) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      }

      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  };
})();

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

  const startYear = 2025;
  const endYear = 2030;

  yearSelect.innerHTML = '';
  for (let y = endYear; y >= startYear; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }

  const nowYear = new Date().getFullYear();
  yearSelect.value = (nowYear >= startYear && nowYear <= endYear) ? nowYear : startYear;

  const monthElem = document.getElementById('monthSelect');
  if (monthElem) monthElem.value = new Date().getMonth() + 1;
}

async function loadCurrentMonthReport() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const yearSelect = document.getElementById('yearSelect');

  const defaultYear = yearSelect ? yearSelect.value : (now.getFullYear() >= 2025 && now.getFullYear() <= 2030 ? now.getFullYear() : 2025);

  const ms = document.getElementById('monthSelect');
  const ys = document.getElementById('yearSelect');
  if (ms) ms.value = month;
  if (ys) ys.value = defaultYear;

  await generateReport();
}

// ------------------ UTILIDAD: DEBOUNCE ------------------
function debounce(fn, wait = 600) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ------------------- SETUP EVENT LISTENERS (actualizada) -------------------
function setupEventListeners() {
  const generateBtn = document.getElementById('generateReport');
  const exportBtn = document.getElementById('exportReport');
  const refreshBtn = document.getElementById('refreshReport');

  if (generateBtn) generateBtn.addEventListener('click', generateReport);
  if (exportBtn) exportBtn.addEventListener('click', exportToPDFIfAllowed);
  if (refreshBtn) refreshBtn.addEventListener('click', refreshReport);

  // selects que disparan generación automática al cambiar
  const monthSelect = document.getElementById('monthSelect');
  const yearSelect  = document.getElementById('yearSelect');

  // Debounced generator — evitar llamadas demasiadas veces seguidas
  const debouncedGenerate = debounce(() => {
    generateReport().catch(err => {
      console.error('Error generando reporte automático:', err);
      showAlert('Error al actualizar el reporte automáticamente', 'error');
    });
  }, 600);

  if (monthSelect) {
    monthSelect.addEventListener('change', debouncedGenerate);
    monthSelect.addEventListener('input', debouncedGenerate);
  }
  if (yearSelect) {
    yearSelect.addEventListener('change', debouncedGenerate);
    yearSelect.addEventListener('input', debouncedGenerate);
  }

  // --- botones para modo (Todo / Con código / Sin código) ---
  const bAll = document.getElementById('btnShowAll');
  const bWith = document.getElementById('btnWithCode');
  const bWithout = document.getElementById('btnWithoutCode');

  if (bAll) {
    bAll.addEventListener('click', () => {
      useCodes = true; // "Todo" interpretamos igual que "con códigos" pero mostraremos todo (luego filtrado)
      bAll.classList.add('active'); bWith.classList.remove('active'); bWithout.classList.remove('active');
      generateReport();
    });
  }

  if (bWith) {
    bWith.addEventListener('click', () => {
      useCodes = true;
      bWith.classList.add('active'); bAll.classList.remove('active'); bWithout.classList.remove('active');
      generateReport();
    });
  }

  if (bWithout) {
    bWithout.addEventListener('click', () => {
      useCodes = false;
      bWithout.classList.add('active'); bAll.classList.remove('active'); bWith.classList.remove('active');
      generateReport();
    });
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() { 
      switchTab(this.dataset.tab); 
    });
  });
}
// Helper: obtener modo actual seleccionado (all | with | without)
function getActiveCodeMode() {
  // si ya usas una variable global _reportFilterMode, úsala; si no toma el botón activo
  if (typeof window._reportFilterMode !== 'undefined') return window._reportFilterMode;
  const withBtn = document.getElementById('btnWithCode');
  const withoutBtn = document.getElementById('btnWithoutCode');
  if (withBtn && withBtn.classList.contains('active')) return 'with';
  if (withoutBtn && withoutBtn.classList.contains('active')) return 'without';
  return 'all';
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
      showAlert("No se pudieron obtener datos para el reporte", 'error');
    }
  } catch (e) {
    console.error("❌ Error generando reporte:", e);
    showAlert("Error: " + (e.message || e), 'error');
  } finally {
    showLoading(false);
  }
}

async function getMonthlyReport(month, year) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
  console.log("📅 Rango:", startDate, "a", endDate);

  // decidir tablas según modo
  const mode = getActiveCodeMode(); // 'all' | 'with' | 'without'
  console.log("🔧 Modo actual useCodes=" + (mode === 'without' ? 'SIN CÓDIGOS' : mode === 'with' ? 'CON CÓDIGOS' : 'TODO'));

  const prodTable = (mode === 'without') ? 'productos_sin_codigo' : 'productos';
  const entradasTable = (mode === 'without') ? 'entradas_sin_codigo' : 'entradas';
  const salidasTable = (mode === 'without') ? 'salidas_sin_codigo' : 'salidas';

  let products = [];
  let entradas = [];
  let salidas = [];

  // 1. OBTENER PRODUCTOS
  try {
    const { data, error } = await supabase
      .from(prodTable)
      .select('*')
      .order('CODIGO', { ascending: true });
    
    if (!error && data) {
      // Mapear a estructura consistente; adaptarse a campos
      products = data.map(p => ({
        // los campos pueden variar: intentamos las variantes más comunes
        codigo: p.CODIGO ?? p.codigo ?? p.code ?? null,
        descripcion: p.DESCRIPCION ?? p.descripcion ?? p.nombre ?? '',
        inventario_fisico: p['INVENTARIO FISICO EN ALMACEN'] ?? p['INVENTARIO'] ?? p['INVENTARIO I069'] ?? p.inventario ?? 0
      }));
      console.log(`📦 Productos mapeados: ${products.length}`);
    } else {
      console.error("Error productos:", error);
      showAlert("Error obteniendo productos: " + (error?.message || error), 'error');
    }
  } catch (e) {
    console.error("Excepción productos:", e);
    showAlert("Error obteniendo productos: " + (e.message || e), 'error');
  }

  // 2. OBTENER ENTRADAS
  try {
    const { data, error } = await supabase
      .from(entradasTable)
      .select('*');
    
    if (!error && data) {
      entradas = data.filter(registro => {
        const fechaRegistro = getRecordDate(registro);
        return isDateInRange(fechaRegistro, startDate, endDate);
      });
      console.log(`📥 Entradas obtenidas: ${entradas.length} (de ${data.length} totales)`);
      if (entradas.length > 0) {
        console.log("🔍 Ejemplo entrada:", entradas[0]);
      }
    } else {
      console.error("Error entradas:", error);
      showAlert("Error obteniendo entradas: " + (error?.message || error), 'error');
    }
  } catch (e) {
    console.error("Excepción entradas:", e);
    showAlert("Error obteniendo entradas: " + (e.message || e), 'error');
  }

  // 3. OBTENER SALIDAS
  try {
    const { data, error } = await supabase
      .from(salidasTable)
      .select('*');
    
    if (!error && data) {
      salidas = data.filter(registro => {
        const fechaRegistro = getRecordDate(registro);
        return isDateInRange(fechaRegistro, startDate, endDate);
      });
      console.log(`📤 Salidas obtenidas: ${salidas.length} (de ${data.length} totales)`);
    } else {
      console.error("Error salidas:", error);
      showAlert("Error obteniendo salidas: " + (error?.message || error), 'error');
    }
  } catch (e) {
    console.error("Excepción salidas:", e);
    showAlert("Error obteniendo salidas: " + (e.message || e), 'error');
  }

  console.log(`📊 DATOS OBTENIDOS: productos=${products.length}, entradas=${entradas.length}, salidas=${salidas.length}`);
  
  // Pasar el modo para que processReportData pueda decidir cómo emparejar
  return processReportData(products, entradas, salidas, month, year, mode);
}


function processReportData(products, entradas, salidas, month, year, mode = 'all') {
  console.log("🔄 Procesando datos... (useCodes =", mode !== 'without', ")");

  const useCodes = (mode !== 'without');

  const summary = { initialStock: 0, finalStock: 0, totalEntries: 0, totalExits: 0, stockDifference: 0 };
  const detailed = [];
  const movements = { entries: [], exits: [] };

  // función para normalizar texto
  const norm = txt => (txt === null || typeof txt === 'undefined') ? '' : String(txt).trim().toLowerCase();

  // Para cada producto (si no hay códigos, intentamos emparejar por descripción)
  products.forEach(prod => {
    const codigo = prod.codigo;
    const descripcion = prod.descripcion ?? '';

    let entradasProd = [];
    let salidasProd = [];

    if (useCodes && codigo !== null && codigo !== undefined && String(codigo).trim() !== '') {
      // buscar por código (variantes)
      entradasProd = entradas.filter(e => {
        return ( (typeof e.codigo !== 'undefined' && String(e.codigo) == String(codigo)) ||
                 (typeof e.CODIGO !== 'undefined' && String(e.CODIGO) == String(codigo)) );
      });
      salidasProd = salidas.filter(s => {
        return ( (typeof s.CODIGO !== 'undefined' && String(s.CODIGO) == String(codigo)) ||
                 (typeof s.codigo !== 'undefined' && String(s.codigo) == String(codigo)) );
      });
    } else {
      // modo sin códigos: emparejar por descripción (contains)
      const dnorm = norm(descripcion);
      entradasProd = entradas.filter(e => {
        const ed = norm(e.descripcion ?? e.producto ?? e.PRODUCTO ?? e.DESCRIPCION ?? e.descripcion_producto ?? '');
        return ed && ed.indexOf(dnorm) !== -1;
      });
      salidasProd = salidas.filter(s => {
        const sd = norm(s.DESCRIPCION ?? s.descripcion ?? s.producto ?? s.PRODUCTO ?? s.descripcion_producto ?? '');
        return sd && sd.indexOf(dnorm) !== -1;
      });
    }

    // totales
    const totalEntradas = entradasProd.reduce((sum, e) => sum + parseNumber(e.cantidad ?? e.CANTIDAD ?? 0), 0);
    const totalSalidas = salidasProd.reduce((sum, s) => sum + parseNumber(s.CANTIDAD_SALIDA ?? s.cantidad ?? s.CANTIDAD ?? 0), 0);

    const stockInicial = parseNumber(prod.inventario_fisico);
    const stockFinal = stockInicial + totalEntradas - totalSalidas;
    const diferencia = stockFinal - stockInicial;

    detailed.push({
      codigo,
      descripcion,
      stockInicial,
      entradas: totalEntradas,
      salidas: totalSalidas,
      stockFinal,
      diferencia,
      tendencia: diferencia > 0 ? 'up' : diferencia < 0 ? 'down' : 'neutral'
    });

    // entradas movimiento - asegurar fecha y campos
    entradasProd.forEach(e => {
      movements.entries.push({
        fecha: getRecordDate(e) || e.fecha || e.FECHA || '',
        codigo_producto: e.codigo ?? e.CODIGO ?? null,
        descripcion_producto: e.DESCRIPCION ?? e.descripcion ?? e.producto ?? prod.descripcion ?? '',
        cantidad: parseNumber(e.cantidad ?? e.CANTIDAD ?? 0),
        responsable: e.responsable ?? e.RESPONSABLE ?? 'No especificado',
        observaciones: e.observaciones ?? e.OBSERVACIONES ?? ''
      });
    });

    // salidas movimiento - asegurar fecha y destino (destinatario)
    salidasProd.forEach(s => {
      movements.exits.push({
        fecha: getRecordDate(s) || s.FECHA_SALIDA || s.fecha || '',
        codigo_producto: s.CODIGO ?? s.codigo ?? null,
        descripcion_producto: s.DESCRIPCION ?? s.descripcion ?? s.producto ?? prod.descripcion ?? '',
        cantidad: parseNumber(s.CANTIDAD_SALIDA ?? s.cantidad ?? s.CANTIDAD ?? 0),
        responsable: s.RESPONSABLE ?? s.responsable ?? 'No especificado',
        destino: s.DESTINATARIO ?? s.destinatario ?? s.DESTINO ?? s.destino ?? '-',
        observaciones: s.OBSERVACIONES ?? s.observaciones ?? ''
      });
    });

    summary.initialStock += stockInicial;
    summary.finalStock += stockFinal;
  });

  summary.totalEntries = movements.entries.reduce((sum, e) => sum + (e.cantidad || 0), 0);
  summary.totalExits = movements.exits.reduce((sum, e) => sum + (e.cantidad || 0), 0);
  summary.stockDifference = summary.finalStock - summary.initialStock;

  console.log("📈 RESUMEN:", summary);
  console.log("📋 DETALLADO:", detailed.length, "productos");
  console.log("🔄 MOVIMIENTOS - Entradas:", movements.entries.length, "Salidas:", movements.exits.length);

  return { summary, detailed, movements, month, year, mode };
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

  // obtener modo actual del reporte si está disponible
  const mode = (window.currentReportData && window.currentReportData.mode) ? window.currentReportData.mode : getActiveCodeMode?.() ?? 'all';
  const showSCWhenMissing = (mode === 'without');

  detailed.forEach(item => {
    // asegurarse que codigo es string para operaciones de texto
    let codeStr = (item.codigo === null || item.codigo === undefined) ? '' : String(item.codigo).trim();

    // si estamos en modo "sin códigos" y no hay código mostramos "S/C"
    if (showSCWhenMissing && (!codeStr || codeStr.toLowerCase() === 'null' || codeStr.toLowerCase() === 'undefined')) {
      codeStr = 'S/C';
    }

    const tendenciaClass = item.tendencia || 'neutral';
    const diferenciaText = (item.diferencia > 0 ? '+' : '') + Math.round(item.diferencia || 0).toLocaleString();

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${codeStr}</td>
      <td>${item.descripcion ?? ''}</td>
      <td>${Math.round(item.stockInicial || 0).toLocaleString()}</td>
      <td>${Math.round(item.entradas || 0).toLocaleString()}</td>
      <td>${Math.round(item.salidas || 0).toLocaleString()}</td>
      <td>${Math.round(item.stockFinal || 0).toLocaleString()}</td>
      <td class="${tendenciaClass}">${diferenciaText}</td>
      <td><span class="${tendenciaClass}">${tendenciaClass === 'up' ? '↗️' : tendenciaClass === 'down' ? '↘️' : '➡️'}</span></td>
    `;
    tbody.appendChild(row);
  });
}



// helper simple para escapar HTML (por seguridad si los datos vienen con caracteres)
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function updateMovementsTables(movements) {
  console.log("🔄 Actualizando tablas de movimientos:", {
    entradas: movements.entries.length,
    salidas: movements.exits.length
  });

  // determinar modo para mostrar S/C cuando corresponda
  const mode = (window.currentReportData && window.currentReportData.mode) ? window.currentReportData.mode : getActiveCodeMode?.() ?? 'all';
  const showSCWhenMissing = (mode === 'without');

  // TABLA DE ENTRADAS
  const entriesBody = document.getElementById('entriesTableBody');
  if (entriesBody) {
    entriesBody.innerHTML = '';
    if (!movements.entries || movements.entries.length === 0) {
      entriesBody.innerHTML = '<tr><td colspan="6" class="text-center">No hay entradas registradas</td></tr>';
    } else {
      movements.entries.forEach(entry => {
        let code = entry.codigo_producto ?? entry.codigo ?? entry.CODIGO ?? '';
        code = (code === null || typeof code === 'undefined') ? '' : String(code).trim();
        if (showSCWhenMissing && (!code || code.toLowerCase() === 'null' || code.toLowerCase() === 'undefined')) code = 'S/C';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${formatDate(entry.fecha)}</td>
          <td>${code}</td>
          <td>${entry.descripcion_producto ?? ''}</td>
          <td>${Math.round(entry.cantidad || 0).toLocaleString()}</td>
          <td>${entry.responsable ?? ''}</td>
          <td>${entry.observaciones ?? ''}</td>
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
    if (!movements.exits || movements.exits.length === 0) {
      exitsBody.innerHTML = '<tr><td colspan="6" class="text-center">No hay salidas registradas</td></tr>';
    } else {
      movements.exits.forEach(exit => {
        let code = exit.codigo_producto ?? exit.codigo ?? exit.CODIGO ?? '';
        code = (code === null || typeof code === 'undefined') ? '' : String(code).trim();
        if (showSCWhenMissing && (!code || code.toLowerCase() === 'null' || code.toLowerCase() === 'undefined')) code = 'S/C';

        const destino = exit.destino ?? exit.DESTINATARIO ?? exit.destinatario ?? exit.DESTINO ?? exit.observaciones ?? '-';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${formatDate(exit.fecha)}</td>
          <td>${code}</td>
          <td>${exit.descripcion_producto ?? ''}</td>
          <td>${Math.round(exit.cantidad || 0).toLocaleString()}</td>
          <td>${exit.responsable ?? ''}</td>
          <td>${destino}</td>
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
      datasets: [({
        label: 'Cantidad',
        data: [reportData.summary.initialStock, reportData.summary.finalStock],
        backgroundColor: ['#667eea', '#764ba2'],
        borderWidth: 2
      })]
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
      labels: topProducts.map(p => p.codigo ? p.codigo : p.descripcion.substring(0, 10) + '...'),
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
  if (!currentReportData) { showAlert('Primero genera un reporte', 'warning'); return; }
  showLoading(true);
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const topMargin = 15;
    const bottomMargin = 15;
    const usableWidth = pageWidth - margin * 2;

    const titleSize = 16;
    const subtitleSize = 10;
    const summarySize = 10;
    const headerFontSize = 9;
    const rowFontSize = 8;
    const lineHeightMultiplier = 1.2;
    const mmPerPt = 0.352778;

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const detailed = Array.isArray(currentReportData.detailed) ? currentReportData.detailed : [];
    const filtered = detailed.filter(it => {
      const entradas = Number(it.entradas ?? it.entrada ?? 0);
      const salidas = Number(it.salidas ?? it.salida ?? 0);
      return entradas > 0 || salidas > 0;
    });

    if (!filtered.length) {
      showAlert('No hay productos con movimientos (entradas o salidas) en este reporte.', 'info');
      showLoading(false);
      return;
    }

    function addFooter(pageNumber) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${pageNumber}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleSize);
    doc.text('Reporte de Inventario', pageWidth / 2, topMargin, { align: 'center' });

    const monthIndex = Number(currentReportData.month) ? Number(currentReportData.month) - 1 : (currentReportData.month ? (monthNames.indexOf(String(currentReportData.month))>=0?monthNames.indexOf(String(currentReportData.month)):0) : 0);
    const monthLabel = monthNames[monthIndex] ?? '';
    doc.setFontSize(subtitleSize);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${monthLabel} ${currentReportData.year ?? ''}`, pageWidth / 2, topMargin + 8, { align: 'center' });

    let cursorY = topMargin + 18;
    doc.setFontSize(summarySize);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen General', margin, cursorY);
    cursorY += 6;
    doc.setFont('helvetica', 'normal');
    const s = currentReportData.summary || {};
    const leftSummary = `Stock Inicial: ${Number(s.initialStock ?? s.stockInicial ?? 0).toLocaleString()}`;
    const rightSummary = `Stock Final: ${Number(s.finalStock ?? s.stockFinal ?? 0).toLocaleString()}`;
    doc.text(leftSummary, margin, cursorY);
    doc.text(rightSummary, margin + 90, cursorY);
    cursorY += 6;
    const leftSummary2 = `Entradas: ${Number(s.totalEntries ?? s.entradas ?? 0).toLocaleString()}`;
    const rightSummary2 = `Salidas: ${Number(s.totalExits ?? s.salidas ?? 0).toLocaleString()}`;
    doc.text(leftSummary2, margin, cursorY);
    doc.text(rightSummary2, margin + 90, cursorY);
    cursorY += 8;

    const cols = [
      { key: 'codigo', title: 'Código', widthPct: 12 },
      { key: 'descripcion', title: 'Descripción', widthPct: 36 },
      { key: 'stockInicial', title: 'Inicial', widthPct: 12 },
      { key: 'entradas', title: 'Entradas', widthPct: 10 },
      { key: 'salidas', title: 'Salidas', widthPct: 10 },
      { key: 'stockFinal', title: 'Final', widthPct: 10 },
      { key: 'diferencia', title: 'Dif.', widthPct: 10 }
    ];
    cols.forEach(c => c.width = Math.round((c.widthPct / 100) * usableWidth));

    function drawTableHeader(y) {
      const headerHeight = (headerFontSize * mmPerPt) * lineHeightMultiplier + 4;
      doc.setFillColor(41, 38, 96);
      doc.rect(margin, y - (headerHeight - 2), usableWidth, headerHeight, 'F');
      doc.setFontSize(headerFontSize);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      let x = margin;
      const paddingLeft = 2;
      cols.forEach(col => {
        doc.text(col.title, x + paddingLeft, y);
        x += col.width;
      });
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 1.5, margin + usableWidth, y + 1.5);
      doc.setTextColor(0);
      return y + headerHeight + 1;
    }

    cursorY = drawTableHeader(cursorY + 4);

    doc.setFontSize(rowFontSize);
    doc.setFont('helvetica', 'normal');

    let pageNumber = 1;
    function addNewPageAndHeader() {
      doc.addPage();
      pageNumber++;
      cursorY = topMargin;
      doc.setFontSize(subtitleSize);
      doc.setFont('helvetica', 'bold');
      doc.text('Reporte de Inventario', pageWidth / 2, cursorY, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`${monthLabel} ${currentReportData.year ?? ''}`, pageWidth / 2, cursorY + 6, { align: 'center' });
      cursorY = cursorY + 12;
      cursorY = drawTableHeader(cursorY + 2);
    }

    const padding = 2;
    for (let i = 0; i < filtered.length; i++) {
      const item = filtered[i];

      const cellTexts = {
        codigo: String(item.codigo ?? item.Codigo ?? item.code ?? ''),
        descripcion: String(item.descripcion ?? item.Descripcion ?? item.nombre ?? ''),
        stockInicial: String(item.stockInicial ?? item.inicial ?? item.stock_inicial ?? 0),
        entradas: String(item.entradas ?? item.entrada ?? item.cantidad_entrada ?? 0),
        salidas: String(item.salidas ?? item.salida ?? item.cantidad_salida ?? 0),
        stockFinal: String(item.stockFinal ?? item.final ?? item.stock_final ?? 0),
        diferencia: String(item.diferencia ?? item.diff ?? ( (item.stockFinal ?? 0) - (item.stockInicial ?? 0) ) ?? 0)
      };

      const linesPerCol = {};
      cols.forEach(col => {
        const w = col.width - padding * 2;
        const raw = cellTexts[col.key] ?? '';
        const lines = doc.splitTextToSize(raw, w);
        linesPerCol[col.key] = lines;
      });

      const maxLines = Math.max(...Object.values(linesPerCol).map(l => l.length || 1));
      const rowHeight = Math.max( (rowFontSize * mmPerPt) * lineHeightMultiplier * maxLines + 4, 6 );

      if (cursorY + rowHeight > pageHeight - bottomMargin) {
        addFooter(pageNumber);
        addNewPageAndHeader();
      }

      let x = margin;
      const startY = cursorY + (rowFontSize * mmPerPt) * lineHeightMultiplier;
      cols.forEach(col => {
        const lines = linesPerCol[col.key];
        const isNumeric = ['stockInicial','entradas','salidas','stockFinal','diferencia'].includes(col.key);
        if (isNumeric) {
          const text = lines.join(' ');
          doc.text(text, x + col.width - padding, startY, { align: 'right' });
        } else {
          doc.text(lines, x + padding, startY);
        }
        x += col.width;
      });

      cursorY += rowHeight;
      doc.setDrawColor(220);
      doc.setLineWidth(0.1);
      doc.line(margin, cursorY - 1, margin + usableWidth, cursorY - 1);
    }

    addFooter(pageNumber);
    const filename = `reporte_movimientos_productos_${currentReportData.month ?? 'mes'}_${currentReportData.year ?? 'anio'}.pdf`;
    doc.save(filename);

  } catch (e) {
    console.error("Error PDF:", e);
    showAlert('Error al exportar', 'error');
  } finally {
    showLoading(false);
  }
}

// ------------------- UTILIDADES -------------------
function showLoading(show) {
  const ov = document.getElementById('loadingOverlay');
  if (ov) ov.style.display = show ? 'flex' : 'none';
}

// ------------------- REFRESH (botón) -------------------
let _refreshLock = false;

async function refreshReport() {
  if (_refreshLock) return;
  _refreshLock = true;

  const btn = document.getElementById('refreshReport');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  try {
    await generateReport();
    console.log("🔄 Datos refrescados");
    showAlert('Datos actualizados', 'success', { duration: 2500 });
  } catch (e) {
    console.error("Error al refrescar:", e);
    showAlert("Error al refrescar datos: " + (e.message || e), 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    _refreshLock = false;
  }
}

// Debug functions
window.debugEntradas = async () => {
  const { data } = await supabase.from('entradas').select('*').limit(5);
  console.log("🔍 Últimas 5 entradas:", data);
  return data;
};

window.debugReport = () => console.log("📊 Reporte actual:", currentReportData);
window.diagnosticarEstructuraCompleta = diagnosticarEstructuraCompleta;

// ------------------- PROTECCIÓN DE EXPORT -------------------
async function exportToPDFIfAllowed() {
  try {
    if (window.security && typeof window.security.getCurrentUserAndRole === 'function') {
      const { user, role } = await window.security.getCurrentUserAndRole();
      if (!user) {
        showAlert('Inicia sesión para exportar', 'warning');
        return;
      }
      if (role !== 'admin') {
        showAlert('No tienes permisos para exportar este informe.', 'warning');
        return;
      }
    }
    await exportToPDF();
  } catch (e) {
    console.error("Error exportToPDFIfAllowed:", e);
    showAlert("Error verificando permisos: " + (e.message || e), 'error');
  }
}