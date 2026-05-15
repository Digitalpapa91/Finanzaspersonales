// ============================================================
// SEED — Carga todos los datos históricos a PostgreSQL
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

// ---- DATOS COMPLETOS ----
const CATEGORIAS = [
  { key: 'vivienda_arriendo', label: 'Vivienda/Arriendo', color: '#4f8ef7', descripcion: 'Pago arriendo mensual ~$313k-$326k' },
  { key: 'cuotas_tc_anteriores', label: 'Cuotas TC', color: '#f87171', descripcion: 'Cuotas de compras anteriores en tarjeta de crédito' },
  { key: 'avance_reestructurado', label: 'Avance Reestructurado', color: '#fb923c', descripcion: '$132.201/mes — feb 2026 a feb 2027' },
  { key: 'retiro_efectivo', label: 'Retiro Efectivo', color: '#ef4444', descripcion: 'Retiros ATM — patrón alcista preocupante 2025' },
  { key: 'otras_transferencias', label: 'Otras Transferencias', color: '#a78bfa', descripcion: 'Transferencias varias sin trazabilidad clara' },
  { key: 'supermercado', label: 'Supermercado', color: '#34d399', descripcion: 'Lider, Jumbo, Unimarc y similares' },
  { key: 'restaurantes', label: 'Restaurantes/Comida', color: '#fbbf24', descripcion: 'Fudo, delivery, bares' },
  { key: 'costos_financieros_tc', label: 'Costos Financieros TC', color: '#f43f5e', descripcion: 'Intereses, comisiones, cargos TC' },
  { key: 'telecomunicaciones', label: 'Telecomunicaciones', color: '#2dd4bf', descripcion: 'Entel, WOM y similares' },
  { key: 'servicios_basicos', label: 'Servicios Básicos', color: '#60a5fa', descripcion: 'Enel, agua, gas' },
  { key: 'tokuspa_comunidad', label: 'Comunidad/Tokuspa', color: '#818cf8', descripcion: 'Gastos comunes edificio' },
  { key: 'comercio_digital', label: 'Comercio Digital/Online', color: '#c084fc', descripcion: 'MercadoPago, Toku, plataformas' },
  { key: 'transporte', label: 'Transporte', color: '#22d3ee', descripcion: 'TAG, Red Movilidad, Uber, Flixbus, Shell' },
  { key: 'salud', label: 'Salud/Farmacia', color: '#4ade80', descripcion: 'Cruz Verde y otras farmacias' },
  { key: 'hogar_articulos', label: 'Hogar/Artículos', color: '#f59e0b', descripcion: 'Artículos para el hogar' },
  { key: 'haulmerpunto', label: 'Haulmerpunto', color: '#ec4899', descripcion: 'Cargo Haulmerpunto' },
  { key: 'maxi_technology', label: 'Maxi Technology', color: '#8b5cf6', descripcion: 'Cargo Maxi Technology SA' },
  { key: 'latam_cuota', label: 'LATAM (cuota)', color: '#06b6d4', descripcion: 'Cuota viaje LATAM 1/12' },
  { key: 'ipanema_cuota', label: 'Ipanema (cuota)', color: '#10b981', descripcion: 'Cuota Motel Ipanema 1/6' },
  { key: 'sin_categorizar', label: 'Sin Categorizar', color: '#475569', descripcion: 'Pendiente de clasificación' }
];

const MESES = [
  {
    id: '2025-01', label: 'Enero 2025', gasto_real: 1031517, ingresos_extras: 0,
    notas: 'Mes base. Gasto promedio de referencia. Costos LC mínimos ($248).',
    costos_financieros: { tc: 19000, lc: 248, total: 19248 },
    desglose: { vivienda_arriendo: 313600, supermercado: 150000, costos_financieros_tc: 19000, retiro_efectivo: 30000, telecomunicaciones: 23000, servicios_basicos: 0, transporte: 15000, restaurantes: 35000, otras_transferencias: 50000, salud: 20000, comercio_digital: 40000, tokuspa_comunidad: 40000, sin_categorizar: 295917 },
    alertas: ['Retiro efectivo inicial: $30k']
  },
  {
    id: '2025-02', label: 'Febrero 2025', gasto_real: 1155489, ingresos_extras: 0,
    notas: '+12% vs enero. Retiro efectivo duplicado. Costos TC suben.',
    costos_financieros: { tc: 26000, lc: 500, total: 26500 },
    desglose: { vivienda_arriendo: 313600, supermercado: 160000, costos_financieros_tc: 26000, retiro_efectivo: 60000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 40000, otras_transferencias: 55000, salud: 25000, comercio_digital: 45000, tokuspa_comunidad: 40000, sin_categorizar: 329889 },
    alertas: ['Retiro efectivo sube a $60k (+100% vs enero)']
  },
  {
    id: '2025-03', label: 'Marzo 2025', gasto_real: 1465178, ingresos_extras: 0,
    notas: '+27% vs feb. ALERTA: retiro en espiral $30k→$60k→$160k. Total Q1: $3.652.184.',
    costos_financieros: { tc: 25663, lc: 0, total: 25663 },
    desglose: { vivienda_arriendo: 313600, supermercado: 170000, costos_financieros_tc: 25663, retiro_efectivo: 160000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 50000, otras_transferencias: 60000, salud: 30000, comercio_digital: 50000, tokuspa_comunidad: 40000, sin_categorizar: 504915 },
    alertas: ['🚨 Retiro efectivo MÁXIMO: $160k (+167% vs feb)', 'Gasto más alto Q1 2025']
  },
  {
    id: '2025-04', label: 'Abril 2025', gasto_real: 929069, ingresos_extras: 0,
    notas: '-37% vs marzo ✅. Compras nuevas TC mínimas. Intereses rotativos dominantes.',
    costos_financieros: { tc: 26841, lc: 0, total: 26841 },
    desglose: { vivienda_arriendo: 320000, supermercado: 120000, costos_financieros_tc: 26841, retiro_efectivo: 0, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 15000, restaurantes: 30000, otras_transferencias: 50000, salud: 20000, comercio_digital: 18623, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 119811, sin_categorizar: 125794 },
    alertas: ['Saldo TC casi al tope: 99.4% cupo usado', 'Retiro efectivo: $0 (buen control)']
  },
  {
    id: '2025-05', label: 'Mayo 2025', gasto_real: 1064564, ingresos_extras: 5500000,
    notas: '+15% vs abril. Retiro efectivo descontrolado. Venta vehículo genera liquidez.',
    costos_financieros: { tc: 30162, lc: 0, total: 30162 },
    desglose: { vivienda_arriendo: 326400, supermercado: 84847, costos_financieros_tc: 30162, retiro_efectivo: 230000, telecomunicaciones: 23450, servicios_basicos: 23458, transporte: 19356, restaurantes: 46130, otras_transferencias: 67500, salud: 16443, comercio_digital: 17550, tokuspa_comunidad: 34701, hogar_articulos: 74000, sin_categorizar: 66567 },
    alertas: ['🚨 Retiro efectivo NUEVO MÁXIMO: $230k', '🟢 Ingreso extraordinario: venta vehículo $5.500.000']
  },
  {
    id: '2025-06', label: 'Junio 2025', gasto_real: 979464, ingresos_extras: 0,
    notas: '-8% vs mayo ✅. Mes relativamente controlado.',
    costos_financieros: { tc: 15000, lc: 1200, total: 16200 },
    desglose: { vivienda_arriendo: 320000, supermercado: 130000, costos_financieros_tc: 15000, retiro_efectivo: 80000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 40000, otras_transferencias: 60000, salud: 20000, comercio_digital: 25000, tokuspa_comunidad: 40000, sin_categorizar: 188464 },
    alertas: []
  },
  {
    id: '2025-07', label: 'Julio 2025', gasto_real: 1076326, ingresos_extras: 0,
    notas: '+10% vs junio. Mes normal sin eventos extraordinarios.',
    costos_financieros: { tc: 18000, lc: 500, total: 18500 },
    desglose: { vivienda_arriendo: 320000, supermercado: 140000, costos_financieros_tc: 18000, retiro_efectivo: 100000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 45000, otras_transferencias: 65000, salud: 20000, comercio_digital: 30000, tokuspa_comunidad: 40000, sin_categorizar: 237326 },
    alertas: []
  },
  {
    id: '2025-08', label: 'Agosto 2025', gasto_real: 1059506, ingresos_extras: 0,
    notas: '-2% vs julio ✅. Costos LC mínimo histórico ($433). Punto Ticket $138k devuelto.',
    costos_financieros: { tc: 16000, lc: 433, total: 16433 },
    desglose: { vivienda_arriendo: 320000, supermercado: 135000, costos_financieros_tc: 16000, retiro_efectivo: 90000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 42000, otras_transferencias: 60000, salud: 20000, comercio_digital: 28000, tokuspa_comunidad: 40000, sin_categorizar: 247506 },
    alertas: ['Déficit pensión agosto: $38.200 (pendiente regularización)']
  },
  {
    id: '2025-09', label: 'Septiembre 2025', gasto_real: 1233323, ingresos_extras: 0,
    notas: '+16% vs agosto. Posible doble pago comunidad. Intereses TC en baja con pagos grandes.',
    costos_financieros: { tc: 9032, lc: 1500, total: 10532 },
    desglose: { vivienda_arriendo: 320000, supermercado: 150000, costos_financieros_tc: 9032, retiro_efectivo: 120000, telecomunicaciones: 23000, servicios_basicos: 50000, transporte: 18000, restaurantes: 50000, otras_transferencias: 70000, salud: 25000, comercio_digital: 35000, tokuspa_comunidad: 100000, sin_categorizar: 263291 },
    alertas: ['🟡 Tokuspa/comunidad $100k (posible bimensual)', '🟢 Intereses TC bajando: $9.032']
  },
  {
    id: '2025-10', label: 'Octubre 2025', gasto_real: 1468471, ingresos_extras: 120000,
    notas: '+19% vs septiembre. Mes con mayor gasto del año. Cuotas TC altas. Ingresos por clases.',
    costos_financieros: { tc: 20000, lc: 2000, total: 22000 },
    desglose: { vivienda_arriendo: 320000, supermercado: 160000, costos_financieros_tc: 20000, retiro_efectivo: 150000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 20000, restaurantes: 55000, otras_transferencias: 70000, salud: 25000, comercio_digital: 40000, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 263000, sin_categorizar: 262471 },
    alertas: ['Mes más alto del año: $1.468.471', '🟢 Ingresos clases: $120.000']
  },
  {
    id: '2025-11', label: 'Noviembre 2025', gasto_real: 1294010, ingresos_extras: 12400,
    notas: '-12% vs octubre ✅. Ingresos ventas edificio: $12.400. Saldo TC post-nov: $778.796.',
    costos_financieros: { tc: 18000, lc: 1500, total: 19500 },
    desglose: { vivienda_arriendo: 320000, supermercado: 145000, costos_financieros_tc: 18000, retiro_efectivo: 110000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 50000, otras_transferencias: 65000, salud: 22000, comercio_digital: 35000, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 190000, sin_categorizar: 238010 },
    alertas: []
  },
  {
    id: '2025-12', label: 'Diciembre 2025', gasto_real: 1350000, ingresos_extras: 0,
    notas: 'Mes de cierre 2025. Fiestas. Cuotas TC altas heredadas del año.',
    costos_financieros: { tc: 22000, lc: 1800, total: 23800 },
    desglose: { vivienda_arriendo: 320000, supermercado: 160000, costos_financieros_tc: 22000, retiro_efectivo: 120000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 20000, restaurantes: 60000, otras_transferencias: 70000, salud: 25000, comercio_digital: 40000, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 264000, sin_categorizar: 96000 },
    alertas: ['Saldo TC alto al cierre diciembre']
  },
  {
    id: '2026-01', label: 'Enero 2026', gasto_real: 1180000, ingresos_extras: 34300,
    notas: 'Inicio 2026. Costos LC mínimos ($248). Ventas de productos activas: $34.300.',
    costos_financieros: { tc: 20000, lc: 248, total: 20248 },
    desglose: { vivienda_arriendo: 320000, supermercado: 140000, costos_financieros_tc: 20000, retiro_efectivo: 90000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 45000, otras_transferencias: 67000, salud: 20000, comercio_digital: 25000, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 273000, sin_categorizar: 69000 },
    alertas: ['🟡 Otras transferencias $67k — patrón mensual sin claridad', '🟡 Cuotas TC $273k en enero (alta)']
  },
  {
    id: '2026-02', label: 'Febrero 2026', gasto_real: 1320000, ingresos_extras: 0,
    notas: 'Reestructuración avance TC: $132.201/mes adicionales durante 12 meses.',
    costos_financieros: { tc: 18000, lc: 0, total: 18000 },
    desglose: { vivienda_arriendo: 320000, supermercado: 145000, costos_financieros_tc: 18000, retiro_efectivo: 100000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 50000, otras_transferencias: 67000, salud: 22000, comercio_digital: 30000, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 190000, avance_reestructurado: 132201, sin_categorizar: 144799 },
    alertas: ['🔴 Avance reestructurado 1/12: $132.201 — carga mensual nueva hasta feb 2027']
  },
  {
    id: '2026-03', label: 'Marzo 2026', gasto_real: 1350000, ingresos_extras: 502646,
    notas: 'Cuotas terminadas: IPS Datax, Paris Arauco, CV 1091, La Polar. Fintual rescate $495.846.',
    costos_financieros: { tc: 20000, lc: 0, total: 20000 },
    desglose: { vivienda_arriendo: 320000, supermercado: 148000, costos_financieros_tc: 20000, retiro_efectivo: 100000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 50000, otras_transferencias: 137600, salud: 22000, comercio_digital: 30000, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 230000, avance_reestructurado: 132201, haulmerpunto: 21499, maxi_technology: 14000, sin_categorizar: 173700 },
    alertas: ['🟡 Haulmerpunto 3×$21.499 — validar qué fue', '🟢 Fintual rescate: $495.846 (18/03)']
  },
  {
    id: '2026-04', label: 'Abril 2026', gasto_real: 1100000, ingresos_extras: 0,
    notas: 'Meta de pago TC fijada: $300.000 para vencimiento 11/06. Seguimiento semanal iniciado.',
    costos_financieros: { tc: 15000, lc: 0, total: 15000 },
    desglose: { vivienda_arriendo: 320000, supermercado: 120000, costos_financieros_tc: 15000, retiro_efectivo: 60000, telecomunicaciones: 23000, servicios_basicos: 20000, transporte: 18000, restaurantes: 45000, otras_transferencias: 67000, salud: 20000, comercio_digital: 25000, tokuspa_comunidad: 40000, cuotas_tc_anteriores: 241000, avance_reestructurado: 132201, sin_categorizar: -26201 },
    alertas: []
  },
  {
    id: '2026-05', label: 'Mayo 2026', gasto_real: 464420, ingresos_extras: 0, mes_abierto: true,
    notas: 'Mes abierto. Seguimiento semanal activo. Meta: pago $300k al vencer 11/06.',
    costos_financieros: { tc: 0, lc: 0, total: 0 },
    desglose: { supermercado: 62000, transporte: 8890, restaurantes: 27958, comercio_digital: 35000, cuotas_tc_anteriores: 302420, latam_cuota: 30378, ipanema_cuota: 12742, sin_categorizar: -14968 },
    alertas: ['🔴 Mes NO CERRADO — datos parciales al 12/05/2026', '🟢 Cuotas que terminan mayo: $44.402 liberados', '🆕 Nueva cuota LATAM 1/12: $30.378', '🆕 Nueva cuota Motel Ipanema 1/6: $12.742']
  }
];

const ALERTAS_GLOBALES = [
  { tipo: 'rojo', titulo: 'Retiro Efectivo en Espiral (Q1 2025)', detalle: 'Patrón preocupante: $30k (ene) → $60k (feb) → $160k (mar) → $230k (may). Acumuló más de $870k en retiros en 2025. Sin trazabilidad de destino.', impacto: 'Alto', estado: 'Mitigado parcialmente en 2026' },
  { tipo: 'rojo', titulo: 'Avance Reestructurado TC — Carga hasta Feb 2027', detalle: '$132.201/mes adicionales desde feb 2026 hasta feb 2027 (12 meses). Costo total de reestructuración: $283.827 en intereses.', impacto: 'Alto', estado: 'Activo' },
  { tipo: 'rojo', titulo: 'Costos Financieros TC: $211k acumulado en 2025', detalle: 'Durante 2025 se pagaron $198.375 en intereses/comisiones TC y $12.671 en costos LC = $211.046 total.', impacto: 'Alto', estado: 'Tendencia bajando en 2026' },
  { tipo: 'amarillo', titulo: 'Otras Transferencias — Sin Trazabilidad Clara', detalle: 'Promedio $65k/mes. Incluye múltiples personas sin categorizar destino. Total estimado 2025: $750k.', impacto: 'Medio', estado: 'Pendiente documentar' },
  { tipo: 'amarillo', titulo: 'Tokuspa/Comunidad Variable', detalle: 'Varía entre $34k y $100k/mes. Posible pago bimensual en septiembre. Promedio: ~$45k/mes.', impacto: 'Bajo-Medio', estado: 'Monitorear' },
  { tipo: 'verde', titulo: 'Ingreso Extraordinario: Venta Vehículo Mayo 2025', detalle: '+$5.500.000 ingresados en mayo 2025. Permitió pago de TAG acumulado, inversión en Fintual y DAP.', impacto: 'Positivo', estado: 'Utilizado' },
  { tipo: 'verde', titulo: 'Fintual Rescate Marzo 2026', detalle: '$495.846 rescatados de Fintual el 18/03/2026. Usados para regularizar deudas.', impacto: 'Positivo', estado: 'Utilizado' },
  { tipo: 'verde', titulo: 'Cuotas TC Terminando Mayo 2026', detalle: 'Liberan $44.402/mes: Haulmerpunto 3/3 + Flow Outlet 3/3 + Entel PCS 6/6.', impacto: 'Positivo', estado: 'Activo' }
];

const CUOTAS_ACTIVAS = [
  { descripcion: 'Avance Reestructurado', cuota: 132201, cuotas_restantes: 9, total_pendiente: 1189809, fin: 'Feb 2027', prioridad: 'alta' },
  { descripcion: 'LATAM (viaje)', cuota: 30378, cuotas_restantes: 11, total_pendiente: 334158, fin: 'Abr 2027', prioridad: 'media' },
  { descripcion: 'Motel Ipanema', cuota: 12742, cuotas_restantes: 5, total_pendiente: 63710, fin: 'Oct 2026', prioridad: 'baja' },
  { descripcion: 'Otras cuotas varias', cuota: 81217, cuotas_restantes: 3, total_pendiente: 243651, fin: 'Ago 2026', prioridad: 'media' }
];

// ---- FUNCIONES DE CARGA ----
async function seed() {
  const client = await pool.connect();
  try {
    console.log('📦 Ejecutando schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    console.log('🧹 Limpiando datos previos...');
    await client.query('DELETE FROM alertas_mes');
    await client.query('DELETE FROM desglose');
    await client.query('DELETE FROM costos_financieros');
    await client.query('DELETE FROM alertas_mes');
    await client.query('DELETE FROM alertas_globales');
    await client.query('DELETE FROM cuotas_activas');
    await client.query('DELETE FROM meses');
    await client.query('DELETE FROM categorias');

    console.log('📝 Insertando categorías...');
    for (const cat of CATEGORIAS) {
      await client.query(
        'INSERT INTO categorias (key, label, color, descripcion) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET label=$2, color=$3, descripcion=$4',
        [cat.key, cat.label, cat.color, cat.descripcion]
      );
    }

    console.log('📅 Insertando meses y desgloses...');
    for (const mes of MESES) {
      await client.query(
        'INSERT INTO meses (id, label, gasto_real, mes_abierto, ingresos_extras, notas) VALUES ($1,$2,$3,$4,$5,$6)',
        [mes.id, mes.label, mes.gasto_real, mes.mes_abierto || false, mes.ingresos_extras || 0, mes.notas || null]
      );
      await client.query(
        'INSERT INTO costos_financieros (mes_id, tc, lc, total) VALUES ($1,$2,$3,$4)',
        [mes.id, mes.costos_financieros.tc, mes.costos_financieros.lc, mes.costos_financieros.total]
      );
      for (const [cat_key, monto] of Object.entries(mes.desglose)) {
        if (monto !== 0) {
          await client.query(
            'INSERT INTO desglose (mes_id, categoria_key, monto) VALUES ($1,$2,$3)',
            [mes.id, cat_key, monto]
          );
        }
      }
      for (const texto of (mes.alertas || [])) {
        await client.query('INSERT INTO alertas_mes (mes_id, texto) VALUES ($1,$2)', [mes.id, texto]);
      }
    }

    console.log('🚨 Insertando alertas globales...');
    for (const a of ALERTAS_GLOBALES) {
      await client.query(
        'INSERT INTO alertas_globales (tipo, titulo, detalle, impacto, estado) VALUES ($1,$2,$3,$4,$5)',
        [a.tipo, a.titulo, a.detalle, a.impacto, a.estado]
      );
    }

    console.log('💳 Insertando cuotas activas...');
    for (const c of CUOTAS_ACTIVAS) {
      await client.query(
        'INSERT INTO cuotas_activas (descripcion, cuota, cuotas_restantes, total_pendiente, fin, prioridad) VALUES ($1,$2,$3,$4,$5,$6)',
        [c.descripcion, c.cuota, c.cuotas_restantes, c.total_pendiente, c.fin, c.prioridad]
      );
    }

    console.log('✅ Seed completado exitosamente.');
  } catch (err) {
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
