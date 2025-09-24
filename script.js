const csvUrl = 'https://docs.google.com/spreadsheets/d/195qbpSSPtsTtl-Ir5u1rOyYtPoqFJLEw4OYZ9_w1KWY/export?format=csv&gid=0';

let datos = [];
let platoChoices;

function parseCSV(text) {
  const rows = text.trim().split('\n').map(row => row.split(','));
  const headers = rows.shift();
  return rows.map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = r[i]?.trim() || '');
    return obj;
  });
}

async function cargarDatos() {
  const response = await fetch(csvUrl);
  const text = await response.text();
  datos = parseCSV(text);

  const platoSelect = document.getElementById('plato-select');
  const platosUnicos = [...new Set(datos.map(d => d['PRODUCCION']).filter(p => p))];

  platoSelect.innerHTML = '';
  platosUnicos.forEach(plato => {
    const option = document.createElement('option');
    option.value = plato;
    option.textContent = plato;
    platoSelect.appendChild(option);
  });

  if (!platoChoices) {
    platoChoices = new Choices(platoSelect, {
      searchEnabled: true,
      itemSelectText: '',
      shouldSort: false,
      placeholder: true,
      searchPlaceholderValue: 'Buscar plato...'
    });

    platoSelect.addEventListener('change', () => {
      seleccionarPlato(platoSelect.value);
    });
  }

  if (platosUnicos.length > 0) {
    platoChoices.setChoiceByValue(platosUnicos[0]);
    seleccionarPlato(platosUnicos[0]);
  }
}

function seleccionarPlato(plato) {
  const insumosPlato = datos.filter(d => d['PRODUCCION'] === plato);
  const principal = insumosPlato.find(d => d['STATUS_INS'].toUpperCase() === 'PRINCIPAL');

  const principalNombreElem = document.getElementById('principal-nombre');
  const principalUnidadElem = document.getElementById('principal-unidad');
  const cantidadPrincipalInput = document.getElementById('cantidad-principal');

  if (!principal) {
    principalNombreElem.textContent = '—';
    principalUnidadElem.textContent = '—';
    cantidadPrincipalInput.value = '';
    mostrarResultados([]);
    return;
  }

  principalNombreElem.textContent = principal['INSUMO'];
  principalUnidadElem.textContent = principal['UNIDAD'];
  cantidadPrincipalInput.value = '';
  mostrarResultados([]);

  cantidadPrincipalInput.oninput = () => calcular(plato, cantidadPrincipalInput.value);
}

function calcular(plato, cantidadPrincipalUsuario) {
  cantidadPrincipalUsuario = parseFloat(cantidadPrincipalUsuario);
  if (isNaN(cantidadPrincipalUsuario) || cantidadPrincipalUsuario <= 0) {
    mostrarResultados([]);
    return;
  }

  const insumosPlato = datos.filter(d => d['PRODUCCION'] === plato);
  const principal = insumosPlato.find(d => d['STATUS_INS'].toUpperCase() === 'PRINCIPAL');
  if (!principal) {
    mostrarResultados([]);
    return;
  }

  const cantidadPrincipalBase = parseFloat(principal['CANTIDAD']);
  const cache = {};

  function calcularSubReceta(nombreSubReceta) {
    if (cache[nombreSubReceta]) return cache[nombreSubReceta];

    const subInsumos = insumosPlato.filter(i => i['PA NOMBRE'] === nombreSubReceta);
    const resultadoSub = [];

    subInsumos.forEach(item => {
      const cantidadBase = parseFloat(item['CANTIDAD']) || 0;
      const unidad = item['UNIDAD'] || '';
      const insumo = item['INSUMO'] || '';
      const estatus = (item['STATUS_INS'] || '').toUpperCase();

      let cantidadCalculada;

      if (estatus === 'NO_CAMBIA') {
        cantidadCalculada = cantidadBase;
      } else {
        cantidadCalculada = (cantidadBase / cantidadPrincipalBase) * cantidadPrincipalUsuario;
      }

      if (insumosPlato.some(i => i['PA NOMBRE'] === insumo)) {
        const cantidadSub = calcularSubReceta(insumo);
        resultadoSub.push({
          subReceta: nombreSubReceta,
          insumo,
          cantidad: cantidadSub,
          unidad
        });
      } else {
        resultadoSub.push({
          subReceta: nombreSubReceta,
          insumo,
          cantidad: cantidadCalculada,
          unidad
        });
      }
    });

    const sumaTotal = resultadoSub.reduce((acc, curr) => acc + curr.cantidad, 0);
    cache[nombreSubReceta] = sumaTotal;
    return sumaTotal;
  }

  const resultados = [];

  insumosPlato.forEach(item => {
    const cantidadBase = parseFloat(item['CANTIDAD']) || 0;
    const unidad = item['UNIDAD'] || '';
    const subReceta = item['PA NOMBRE'] || '';
    const insumo = item['INSUMO'] || '';
    const estatus = (item['STATUS_INS'] || '').toUpperCase();

    let cantidadCalculada;
    const esSubReceta = insumosPlato.some(i => i['PA NOMBRE'] === insumo);

    if (esSubReceta) {
      cantidadCalculada = calcularSubReceta(insumo);
    } else if (estatus === 'NO_CAMBIA') {
      cantidadCalculada = cantidadBase;
    } else {
      cantidadCalculada = (cantidadBase / cantidadPrincipalBase) * cantidadPrincipalUsuario;
    }

    resultados.push({
      subReceta,
      insumo,
      cantidad: cantidadCalculada,
      unidad
    });
  });

  mostrarResultados(resultados);
}

function mostrarResultados(lista) {
  const tbody = document.querySelector('#resultado-tabla tbody');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.setAttribute('colspan', 4);
    td.textContent = 'No hay resultados para mostrar.';
    td.style.textAlign = 'center';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  let ultimoGrupo = null;
  let colorIndex = 0;
  const colores = ['grupo-par', 'grupo-impar'];

  lista.forEach(item => {
    if (item.subReceta !== ultimoGrupo) {
      ultimoGrupo = item.subReceta;
      colorIndex = (colorIndex + 1) % colores.length;
    }

    if (!tbody.querySelector(`tr[data-grupo="${ultimoGrupo}"]`)) {
      const trHeader = document.createElement('tr');
      trHeader.classList.add(colores[colorIndex]);
      trHeader.setAttribute('data-grupo', ultimoGrupo);

      const th = document.createElement('th');
      th.setAttribute('colspan', 4);
      th.textContent = `🔹 PA NOMBRE: ${item.subReceta}`;
      th.style.textAlign = 'left';
      th.style.padding = '0.8rem 1rem';
      th.style.fontWeight = 'bold';
      th.style.fontSize = '1rem';
      trHeader.appendChild(th);
      tbody.appendChild(trHeader);
    }

    const tr = document.createElement('tr');
    tr.classList.add(colores[colorIndex]);
    tr.setAttribute('data-grupo', ultimoGrupo);

    const tdSub = document.createElement('td');
    tdSub.textContent = item.subReceta;
    tr.appendChild(tdSub);

    const tdInsumo = document.createElement('td');
    tdInsumo.textContent = item.insumo;
    tr.appendChild(tdInsumo);

    const tdCantidad = document.createElement('td');
    tdCantidad.textContent = item.cantidad.toFixed(2);
    tr.appendChild(tdCantidad);

    const tdUnidad = document.createElement('td');
    tdUnidad.textContent = item.unidad;
    tr.appendChild(tdUnidad);

    tbody.appendChild(tr);
  });
}

// === GUARDAR ===
document.getElementById('btn-guardar').addEventListener('click', async () => {
  const filas = Array.from(document.querySelectorAll('#resultado-tabla tbody tr'))
    .filter(tr => tr.children.length === 4)
    .map(tr => ({
      subReceta: tr.children[0].textContent,
      insumo: tr.children[1].textContent,
      cantidad: parseFloat(tr.children[2].textContent),
      unidad: tr.children[3].textContent
    }));

  if (filas.length === 0) return alert("No hay datos para guardar.");

  const plato = document.getElementById('plato-select').value;
  const cantidadPrincipal = document.getElementById('cantidad-principal').value;

  const payload = {
    plato,
    cantidadPrincipal,
    receta: filas
  };

  try {
    const url = 'https://script.google.com/macros/s/AKfycbxn8mQXCQwbR3wUpC7Ii-dX1126SBIoEx1SMS52FA0SjcL8YVqVKhb2bSKCgsbEk_cVqQ/exec';
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();
    alert(result.message || 'Receta guardada exitosamente.');
  } catch (err) {
    console.error(err);
    alert("Error al guardar la receta.");
  }
});

// === IMPRIMIR PDF ===
document.getElementById('btn-imprimir').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const plato = document.getElementById('plato-select').value;
  const cantidad = document.getElementById('cantidad-principal').value;
  const fecha = new Date().toLocaleDateString();

  let y = 10;
  doc.setFontSize(16);
  doc.text("Receta Calculada", 10, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(`📅 Fecha: ${fecha}`, 10, y);
  y += 6;
  doc.text(`🍽️ Plato: ${plato}`, 10, y);
  y += 6;
  doc.text(`🔢 Cantidad principal: ${cantidad}`, 10, y);
  y += 10;

  const filas = Array.from(document.querySelectorAll('#resultado-tabla tbody tr'))
    .filter(tr => tr.children.length === 4)
    .map(tr => ({
      subReceta: tr.children[0].textContent,
      insumo: tr.children[1].textContent,
      cantidad: tr.children[2].textContent,
      unidad: tr.children[3].textContent
    }));

  if (filas.length === 0) {
    alert("No hay datos para imprimir.");
    return;
  }

  let grupoActual = "";
  filas.forEach(fila => {
    if (y > 270) {
      doc.addPage();
      y = 10;
    }

    if (fila.subReceta !== grupoActual) {
      grupoActual = fila.subReceta;
      doc.setFontSize(13);
      doc.setTextColor(40, 40, 160);
      doc.text(`🔹 PA NOMBRE: ${grupoActual}`, 10, y);
      y += 6;
    }

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`• ${fila.insumo} — ${fila.cantidad} ${fila.unidad}`, 12, y);
    y += 6;
  });

  const nombreArchivo = `Receta_${plato.replace(/\s+/g, '_')}_${fecha.replace(/\//g, '-')}.pdf`;
  doc.save(nombreArchivo);
});

// Cargar todo al inicio
cargarDatos();
