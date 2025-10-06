// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Variables globales
let charts = {};
let currentReportData = null;

// ------------------- INICIALIZACIÓN -------------------
document.addEventListener('DOMContentLoaded', function() {
    initializeYearSelect();
    setupEventListeners();
    loadCurrentMonthReport();
});

function initializeYearSelect() {
    const yearSelect = document.getElementById('yearSelect');
    const currentYear = new Date().getFullYear();
    
    yearSelect.innerHTML = '';
    for (let year = currentYear; year >= currentYear - 5; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }
    
    yearSelect.value = currentYear;
    document.getElementById('monthSelect').value = new Date().getMonth() + 1;
}

function setupEventListeners() {
    document.getElementById('generateReport').addEventListener('click', generateReport);
    document.getElementById('exportReport').addEventListener('click', exportToPDF);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// ------------------- GENERAR REPORTE -------------------
async function generateReport() {
    showLoading(true);
    
    try {
        const month = parseInt(document.getElementById('monthSelect').value);
        const year = parseInt(document.getElementById('yearSelect').value);
        
        if (!month || !year) {
            throw new Error('Mes o año no válido');
        }
        
        const reportData = await getMonthlyReport(month, year);
        
        if (!reportData) {
            throw new Error('No se pudieron obtener los datos del reporte');
        }
        
        currentReportData = reportData;
        
        updateSummaryCards(reportData.summary);
        updateDetailedTable(reportData.detailed);
        updateMovementsTables(reportData.movements);
        generateCharts(reportData);
        
    } catch (error) {
        console.error('Error generando reporte:', error);
        alert('Error al generar el reporte: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function loadCurrentMonthReport() {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    document.getElementById('monthSelect').value = currentMonth;
    document.getElementById('yearSelect').value = currentYear;
    
    await generateReport();
}

// ------------------- OBTENER DATOS CORREGIDO -------------------
async function getMonthlyReport(month, year) {
    if (!supabase) {
        throw new Error('Error de conexión con la base de datos');
    }
    
    try {
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = `${year}-${month.toString().padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
        
        console.log('Obteniendo reporte para:', startDate, 'hasta', endDate);
        
        // Obtener productos
        const { data: products, error: productsError } = await supabase
            .from('productos')
            .select('codigo, descripcion')
            .order('codigo');
        
        if (productsError) {
            console.error('Error obteniendo productos:', productsError);
            throw new Error('Error al cargar los productos');
        }
        
        if (!products || products.length === 0) {
            throw new Error('No se encontraron productos en el sistema');
        }
        
        // Obtener entradas del mes - CORREGIDO
        const { data: entradas, error: entradasError } = await supabase
            .from('entradas')
            .select('*')
            .gte('fecha_entrada', startDate)
            .lte('fecha_entrada', endDate)
            .order('fecha_entrada', { ascending: true });
        
        if (entradasError) {
            console.error('Error obteniendo entradas:', entradasError);
            throw new Error('Error al cargar las entradas');
        }
        
        // Obtener salidas del mes - CORREGIDO
        const { data: salidas, error: salidasError } = await supabase
            .from('salidas')
            .select('*')
            .gte('fecha_salida', startDate)
            .lte('fecha_salida', endDate)
            .order('fecha_salida', { ascending: true });
        
        if (salidasError) {
            console.error('Error obteniendo salidas:', salidasError);
            throw new Error('Error al cargar las salidas');
        }
        
        console.log('Entradas encontradas:', entradas?.length || 0);
        console.log('Salidas encontradas:', salidas?.length || 0);
        
        // Obtener snapshot inicial del mes anterior
        const initialStock = await getInitialStock(month, year, products);
        
        return processReportData(products, entradas || [], salidas || [], initialStock, month, year);
        
    } catch (error) {
        console.error('Error en getMonthlyReport:', error);
        throw error;
    }
}

async function getInitialStock(month, year, products) {
    // Calcular fecha del último día del mes anterior
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const snapshotDate = `${prevYear}-${prevMonth.toString().padStart(2, '0')}-${prevMonthLastDay.toString().padStart(2, '0')}`;
    
    try {
        // Buscar snapshot del mes anterior
        const { data: snapshot, error } = await supabase
            .from('inventario_snapshot')
            .select('*')
            .eq('fecha', snapshotDate)
            .single();
        
        if (error || !snapshot) {
            console.warn('No se encontró snapshot para fecha:', snapshotDate, 'Inicializando en 0');
            // Si no hay snapshot, inicializar todos los productos en 0
            const initialStock = {};
            products.forEach(product => {
                initialStock[product.codigo] = 0;
            });
            return initialStock;
        }
        
        return snapshot.productos || {};
        
    } catch (error) {
        console.error('Error obteniendo snapshot inicial:', error);
        // En caso de error, retornar stock inicial en 0
        const initialStock = {};
        products.forEach(product => {
            initialStock[product.codigo] = 0;
        });
        return initialStock;
    }
}

function processReportData(products, entradas, salidas, initialStock, month, year) {
    const summary = {
        initialStock: 0,
        finalStock: 0,
        totalEntries: 0,
        totalExits: 0,
        stockDifference: 0
    };
    
    const detailed = [];
    const movementsData = {
        entries: [],
        exits: []
    };
    
    // Procesar cada producto
    products.forEach(product => {
        // Filtrar entradas y salidas por producto
        const productEntradas = entradas.filter(e => e.codigo_producto === product.codigo);
        const productSalidas = salidas.filter(s => s.codigo_producto === product.codigo);
        
        const initialQty = initialStock[product.codigo] || 0;
        
        // Calcular totales
        const totalEntradas = productEntradas.reduce((sum, entrada) => sum + (entrada.cantidad_entrada || 0), 0);
        const totalSalidas = productSalidas.reduce((sum, salida) => sum + (salida.cantidad_salida || 0), 0);
        
        const finalQty = initialQty + totalEntradas - totalSalidas;
        const difference = finalQty - initialQty;
        
        // Actualizar resumen
        summary.initialStock += initialQty;
        summary.finalStock += finalQty;
        summary.totalEntries += totalEntradas;
        summary.totalExits += totalSalidas;
        
        // Agregar a detallado
        detailed.push({
            codigo: product.codigo,
            descripcion: product.descripcion,
            stockInicial: initialQty,
            entradas: totalEntradas,
            salidas: totalSalidas,
            stockFinal: finalQty,
            diferencia: difference,
            tendencia: difference > 0 ? 'up' : difference < 0 ? 'down' : 'neutral'
        });
        
        // Procesar movimientos para las tablas
        productEntradas.forEach(entrada => {
            movementsData.entries.push({
                fecha: entrada.fecha_entrada,
                codigo_producto: entrada.codigo_producto,
                descripcion_producto: product.descripcion,
                cantidad: entrada.cantidad_entrada,
                responsable: entrada.responsable,
                observaciones: entrada.observaciones || '-'
            });
        });
        
        productSalidas.forEach(salida => {
            movementsData.exits.push({
                fecha: salida.fecha_salida,
                codigo_producto: salida.codigo_producto,
                descripcion_producto: product.descripcion,
                cantidad: salida.cantidad_salida,
                responsable: salida.responsable,
                destino: salida.destino || '-'
            });
        });
    });
    
    summary.stockDifference = summary.finalStock - summary.initialStock;
    
    // Ordenar movimientos por fecha
    movementsData.entries.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    movementsData.exits.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    return {
        summary,
        detailed,
        movements: movementsData,
        month,
        year
    };
}

// ------------------- ACTUALIZAR UI -------------------
function updateSummaryCards(summary) {
    document.getElementById('initialStock').textContent = summary.initialStock.toLocaleString();
    document.getElementById('finalStock').textContent = summary.finalStock.toLocaleString();
    document.getElementById('totalEntries').textContent = summary.totalEntries.toLocaleString();
    document.getElementById('totalExits').textContent = summary.totalExits.toLocaleString();
    
    const differenceElem = document.getElementById('stockDifference');
    differenceElem.textContent = summary.stockDifference > 0 ? 
        `+${summary.stockDifference.toLocaleString()}` : 
        summary.stockDifference.toLocaleString();
    
    differenceElem.className = `card-value ${summary.stockDifference > 0 ? 'trend-up' : summary.stockDifference < 0 ? 'trend-down' : ''}`;
}

function updateDetailedTable(detailed) {
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';
    
    if (detailed.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="8" class="text-center">No hay datos disponibles</td>`;
        tbody.appendChild(row);
        return;
    }
    
    detailed.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.codigo}</td>
            <td>${item.descripcion}</td>
            <td>${item.stockInicial.toLocaleString()}</td>
            <td>${item.entradas.toLocaleString()}</td>
            <td>${item.salidas.toLocaleString()}</td>
            <td>${item.stockFinal.toLocaleString()}</td>
            <td class="${item.tendencia}">
                ${item.diferencia > 0 ? '+' : ''}${item.diferencia.toLocaleString()}
            </td>
            <td>
                <span class="${item.tendencia}">
                    ${item.tendencia === 'up' ? '↗️' : item.tendencia === 'down' ? '↘️' : '➡️'}
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateMovementsTables(movements) {
    // Actualizar tabla de entradas
    const entriesBody = document.getElementById('entriesTableBody');
    entriesBody.innerHTML = '';
    
    if (movements.entries.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" class="text-center">No hay entradas registradas en este período</td>`;
        entriesBody.appendChild(row);
    } else {
        movements.entries.forEach(entry => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDate(entry.fecha)}</td>
                <td>${entry.codigo_producto}</td>
                <td>${entry.descripcion_producto}</td>
                <td>${entry.cantidad.toLocaleString()}</td>
                <td>${entry.responsable || '-'}</td>
                <td>${entry.observaciones || '-'}</td>
            `;
            entriesBody.appendChild(row);
        });
    }
    
    // Actualizar tabla de salidas
    const exitsBody = document.getElementById('exitsTableBody');
    exitsBody.innerHTML = '';
    
    if (movements.exits.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" class="text-center">No hay salidas registradas en este período</td>`;
        exitsBody.appendChild(row);
    } else {
        movements.exits.forEach(exit => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDate(exit.fecha)}</td>
                <td>${exit.codigo_producto}</td>
                <td>${exit.descripcion_producto}</td>
                <td>${exit.cantidad.toLocaleString()}</td>
                <td>${exit.responsable || '-'}</td>
                <td>${exit.destino || '-'}</td>
            `;
            exitsBody.appendChild(row);
        });
    }
}

// Función auxiliar para formatear fecha
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

// ------------------- GRÁFICOS -------------------
function generateCharts(reportData) {
    destroyExistingCharts();
    
    if (reportData.detailed.length === 0) {
        showNoDataCharts();
        return;
    }
    
    generateMonthlyComparisonChart(reportData);
    generateProductMovementChart(reportData);
    generateTopProductsChart(reportData);
    generateEntriesExitsChart(reportData);
}

function showNoDataCharts() {
    const chartIds = [
        'monthlyComparisonChart',
        'productMovementChart', 
        'topProductsChart',
        'entriesExitsChart'
    ];
    
    chartIds.forEach(chartId => {
        const ctx = document.getElementById(chartId).getContext('2d');
        charts[chartId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sin datos'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#e5e7eb']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'No hay datos disponibles'
                    }
                }
            }
        });
    });
}

function destroyExistingCharts() {
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    charts = {};
}

function generateMonthlyComparisonChart(reportData) {
    const ctx = document.getElementById('monthlyComparisonChart').getContext('2d');
    
    charts.comparison = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Stock Inicial', 'Stock Final'],
            datasets: [{
                label: 'Cantidad',
                data: [reportData.summary.initialStock, reportData.summary.finalStock],
                backgroundColor: ['#667eea', '#764ba2'],
                borderColor: ['#5a6fd8', '#6a4190'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Comparación Stock Inicial vs Final'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function generateProductMovementChart(reportData) {
    const topProducts = reportData.detailed
        .sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas))
        .slice(0, 8);
    
    const ctx = document.getElementById('productMovementChart').getContext('2d');
    
    charts.movement = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topProducts.map(p => p.codigo),
            datasets: [
                {
                    label: 'Entradas',
                    data: topProducts.map(p => p.entradas),
                    backgroundColor: '#10b981',
                    borderColor: '#059669',
                    borderWidth: 1
                },
                {
                    label: 'Salidas',
                    data: topProducts.map(p => p.salidas),
                    backgroundColor: '#ef4444',
                    borderColor: '#dc2626',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Movimiento por Producto (Top 8)'
                }
            },
            scales: {
                x: {
                    stacked: false
                },
                y: {
                    stacked: false
                }
            }
        }
    });
}

function generateTopProductsChart(reportData) {
    const topProducts = reportData.detailed
        .sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas))
        .slice(0, 10);
    
    const ctx = document.getElementById('topProductsChart').getContext('2d');
    
    charts.topProducts = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: topProducts.map(p => p.descripcion.substring(0, 20) + (p.descripcion.length > 20 ? '...' : '')),
            datasets: [{
                data: topProducts.map(p => p.entradas + p.salidas),
                backgroundColor: [
                    '#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444',
                    '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right'
                },
                title: {
                    display: true,
                    text: 'Top 10 Productos con Más Movimiento'
                }
            }
        }
    });
}

function generateEntriesExitsChart(reportData) {
    const ctx = document.getElementById('entriesExitsChart').getContext('2d');
    
    charts.entriesExits = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Entradas', 'Salidas'],
            datasets: [{
                data: [reportData.summary.totalEntries, reportData.summary.totalExits],
                backgroundColor: ['#10b981', '#ef4444'],
                borderColor: ['#059669', '#dc2626'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'Distribución Entradas vs Salidas'
                }
            }
        }
    });
}

// ------------------- EXPORTAR PDF -------------------
async function exportToPDF() {
    if (!currentReportData) {
        alert('Primero genera un reporte');
        return;
    }
    
    showLoading(true);
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Título
        doc.setFontSize(20);
        doc.text('Reporte de Inventario', 105, 15, { align: 'center' });
        
        // Fecha del reporte
        doc.setFontSize(12);
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        doc.text(`Período: ${monthNames[currentReportData.month - 1]} ${currentReportData.year}`, 105, 25, { align: 'center' });
        
        // Resumen
        doc.setFontSize(16);
        doc.text('Resumen General', 20, 40);
        
        doc.setFontSize(10);
        let yPosition = 50;
        doc.text(`Stock Inicial: ${currentReportData.summary.initialStock.toLocaleString()}`, 20, yPosition);
        doc.text(`Stock Final: ${currentReportData.summary.finalStock.toLocaleString()}`, 20, yPosition + 7);
        doc.text(`Entradas: ${currentReportData.summary.totalEntries.toLocaleString()}`, 20, yPosition + 14);
        doc.text(`Salidas: ${currentReportData.summary.totalExits.toLocaleString()}`, 20, yPosition + 21);
        doc.text(`Diferencia: ${currentReportData.summary.stockDifference.toLocaleString()}`, 20, yPosition + 28);
        
        // Tabla detallada
        doc.setFontSize(16);
        doc.text('Detalle por Producto', 20, 90);
        
        // Encabezados de tabla
        doc.setFontSize(8);
        const headers = ['Código', 'Descripción', 'Inicial', 'Entradas', 'Salidas', 'Final', 'Dif.'];
        let xPosition = 20;
        
        headers.forEach(header => {
            doc.text(header, xPosition, 100);
            xPosition += 25;
        });
        
        // Datos de tabla
        yPosition = 107;
        currentReportData.detailed.slice(0, 30).forEach(item => {
            if (yPosition > 270) {
                doc.addPage();
                yPosition = 20;
            }
            
            xPosition = 20;
            doc.text(item.codigo, xPosition, yPosition);
            doc.text(item.descripcion.substring(0, 15), xPosition + 25, yPosition);
            doc.text(item.stockInicial.toString(), xPosition + 50, yPosition);
            doc.text(item.entradas.toString(), xPosition + 75, yPosition);
            doc.text(item.salidas.toString(), xPosition + 100, yPosition);
            doc.text(item.stockFinal.toString(), xPosition + 125, yPosition);
            doc.text(item.diferencia.toString(), xPosition + 150, yPosition);
            
            yPosition += 7;
        });
        
        // Guardar PDF
        const fileName = `reporte_inventario_${currentReportData.month}_${currentReportData.year}.pdf`;
        doc.save(fileName);
        
    } catch (error) {
        console.error('Error exportando PDF:', error);
        alert('Error al exportar el reporte');
    } finally {
        showLoading(false);
    }
}

// ------------------- UTILIDADES -------------------
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('show', show);
    }
}