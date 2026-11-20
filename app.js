// app.js

document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btnRefresh');
  const btnExportPdf = document.getElementById('btnExportPdf');
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const dataView = document.getElementById('dataView');
  const errorMsg = document.getElementById('errorMsg');

  const totalCountEl = document.getElementById('totalCount');
  const alertCountEl = document.getElementById('alertCount');
  const lastResponsibleEl = document.getElementById('lastResponsible');
  const lastDateEl = document.getElementById('lastDate');
  const categoriasList = document.getElementById('categoriasList');
  const alertasList = document.getElementById('alertasList');
  const emptyState = document.getElementById('emptyState');
  const alertCategoryChips = document.getElementById('alertCategoryChips');

  let globalData = null;
  let currentAlerts = [];
  let activeAlertCategory = 'Todas';

  const states = {
    loading: loadingState,
    error: errorState,
    data: dataView
  };

  function showState(stateName) {
    Object.values(states).forEach(el => el.classList.add('hidden'));
    if (states[stateName]) {
      states[stateName].classList.remove('hidden');
    }
  }

  // Busca a última contagem geral e por categoria diretamente na aba Fato_Contagem
  async function fetchLastCountFromSheet(skuToCatMap) {
    try {
      if (!CONFIG.GOOGLE_SHEETS_API_KEY || !CONFIG.SPREADSHEET_ID) {
        return null;
      }

      const sheetName = CONFIG.FATO_CONTAGEM_SHEET || 'Fato_Contagem';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${CONFIG.GOOGLE_SHEETS_API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) return null;

      const sheetData = await response.json();
      const rows = sheetData.values;
      if (!rows || rows.length < 2) return null;

      const headers = rows[0].map(h => h.toString().toLowerCase().trim());
      const dataIdx = headers.findIndex(h => h.includes('data'));
      const respIdx = headers.findIndex(h => h.includes('respons'));
      const skuIdx = headers.findIndex(h => h.includes('sku'));

      let generalLast = null;
      const byCat = {};

      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const resp = respIdx !== -1 ? (row[respIdx] || '').toString().trim() : '';
        const rawDate = dataIdx !== -1 ? (row[dataIdx] || '').toString().trim() : '';
        const sku = skuIdx !== -1 ? (row[skuIdx] || '').toString().trim() : '';

        if (resp || rawDate) {
          const formattedDate = formatarDataHora(rawDate) || 'Sem registro';
          if (!generalLast) {
            generalLast = {
              responsavel: resp || 'N/A',
              data: formattedDate
            };
          }
          const cat = skuToCatMap[sku];
          if (cat && !byCat[cat]) {
            byCat[cat] = {
              responsavel: resp || 'N/A',
              data: formattedDate
            };
          }
        }
      }

      return generalLast ? { lastCount: generalLast, lastCountByCat: byCat } : null;
    } catch (err) {
      console.warn('Não foi possível ler Fato_Contagem diretamente:', err);
    }
    return null;
  }

  function formatarDataHora(valor) {
    if (!valor) return '';
    const matchISO = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (matchISO) {
      const [, ano, mes, dia, hora, min] = matchISO;
      if (hora && min) {
        return `${dia}/${mes}/${ano} às ${hora}:${min}`;
      }
      return `${dia}/${mes}/${ano}`;
    }
    return valor;
  }

  async function loadData() {
    showState('loading');
    if (btnRefresh) {
      btnRefresh.classList.add('spinning');
      btnRefresh.disabled = true;
    }

    try {
      if (!CONFIG.APPS_SCRIPT_URL) {
        throw new Error('Configuração pendente. O link do Apps Script está em falta no config.js.');
      }

      const separador = CONFIG.APPS_SCRIPT_URL.includes('?') ? '&' : '?';
      const urlAtualizado = CONFIG.APPS_SCRIPT_URL + separador + 'nocache=' + new Date().getTime();
      const response = await fetch(urlAtualizado);

      if (!response.ok) {
        throw new Error(`Erro na ligação ao servidor: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`Erro da API: ${data.error}`);
      }

      const itensRecebidos = data.items || data;
      if (!Array.isArray(itensRecebidos) || itensRecebidos.length === 0) {
        throw new Error('O inventário encontra-se vazio ou os dados são inválidos.');
      }

      // Mapa SKU -> Categoria para cruzar com Fato_Contagem
      const skuToCatMap = {};
      itensRecebidos.forEach(item => {
        const keys = Object.keys(item);
        const skuKey = keys.find(k => k.includes('sku') || k.includes('codigo')) || 'sku';
        const catKey = keys.find(k => k.includes('categoria')) || 'categoria';
        const skuVal = (item[skuKey] || '').toString().trim();
        const catVal = (item[catKey] || '').toString().trim();
        if (skuVal && catVal) skuToCatMap[skuVal] = catVal;
      });

      const sheetCounts = await fetchLastCountFromSheet(skuToCatMap);
      const apiLastCount = (data.lastCount && data.lastCount.responsavel && data.lastCount.responsavel !== 'N/A')
        ? data.lastCount
        : null;

      globalData = {
        items: itensRecebidos,
        lastCount: (sheetCounts && sheetCounts.lastCount) || apiLastCount || { responsavel: 'N/A', data: 'Sem registro' },
        lastCountByCat: (sheetCounts && sheetCounts.lastCountByCat) || data.lastCountByCat || {}
      };

      processDashboardData();

    } catch (error) {
      console.error("Detalhe do erro:", error);
      errorMsg.textContent = error.message;
      showState('error');
      if (totalCountEl) totalCountEl.textContent = '-';
      if (alertCountEl) alertCountEl.textContent = '-';
    } finally {
      if (btnRefresh) {
        btnRefresh.classList.remove('spinning');
        btnRefresh.disabled = false;
      }
    }
  }

  function processDashboardData() {
    if (globalData.lastCount) {
      lastResponsibleEl.textContent = globalData.lastCount.responsavel || 'N/A';
      lastDateEl.textContent = globalData.lastCount.data || 'Sem registro';
    }

    const categoriasMap = {};
    const alertas = [];
    let totalItensDisponiveis = 0;
    const catSet = new Set(['Todas']);

    globalData.items.forEach(item => {
      const keys = Object.keys(item);
      const skuKey = keys.find(k => k.includes('sku') || k.includes('codigo')) || 'sku';
      const nomeKey = keys.find(k => k.includes('nome') || k.includes('produto')) || 'nome';
      const catKey = keys.find(k => k.includes('categoria')) || 'categoria';
      const unidKey = keys.find(k => k.includes('unidade') || k.includes('um')) || 'unidade';
      const idealKey = keys.find(k => k.includes('estoque') && k.includes('ideal')) || 'estoque_ideal';
      const qtdKey = keys.find(k => k.includes('quantidade') || k.includes('atual')) || 'quantidade_atual';
      const statusKey = keys.find(k => k.includes('status')) || 'status';

      const sku = item[skuKey] || '';
      const nome = item[nomeKey] || '';

      if (!sku && !nome) return;

      const categoria = item[catKey] && item[catKey].toString().trim() !== '' ? item[catKey].trim() : 'Sem Categoria';
      const unidade = item[unidKey] && item[unidKey].toString().trim() !== '' ? item[unidKey].trim() : 'UN';
      const quantidade = Number(item[qtdKey]) || 0;
      const ideal = Number(item[idealKey]) || 0;
      const statusStr = item[statusKey] ? item[statusKey].toString().toLowerCase() : '';

      catSet.add(categoria);
      totalItensDisponiveis += quantidade;

      if (!categoriasMap[categoria]) {
        categoriasMap[categoria] = { disponivel: 0, falta: 0, totalItens: 0 };
      }
      categoriasMap[categoria].disponivel += quantidade;
      categoriasMap[categoria].totalItens++;

      if (quantidade < ideal || statusStr.includes('esgotado') || statusStr.includes('alerta')) {
        const deficit = Math.max(0, ideal - quantidade);
        categoriasMap[categoria].falta += deficit;

        alertas.push({
          sku: sku || 'N/A',
          nome: nome || 'Produto sem nome',
          unidade: unidade,
          quantidade: quantidade,
          ideal: ideal,
          deficit: deficit,
          categoria: categoria
        });
      }
    });

    currentAlerts = alertas;

    renderTotals(totalItensDisponiveis, alertas.length);
    renderCategories(categoriasMap);
    renderAlertChips(Array.from(catSet).sort((a, b) => a.localeCompare(b, 'pt-BR')));
    renderAlerts(alertas);

    showState('data');
  }

  function renderTotals(totalQtd, totalAlertas) {
    totalCountEl.textContent = totalQtd;
    alertCountEl.textContent = totalAlertas;
  }

  function renderCategories(categoriasMap) {
    categoriasList.innerHTML = '';
    const sortedCategories = Object.entries(categoriasMap).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

    sortedCategories.forEach(([categoryName, stats]) => {
      categoriasList.innerHTML += `
        <div style="background: #f8f9fa; padding: 14px 16px; border-radius: 8px; border: 1px solid #e8eaed; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #3c4043; font-weight: 500;">${categoryName}</span>
          <div style="display: flex; gap: 8px; font-size: 12px; font-weight: bold;">
            <span style="background: #e6f4ea; color: #137333; padding: 4px 10px; border-radius: 12px;">Disp: ${stats.disponivel}</span>
            <span style="background: #fce8e6; color: #c5221f; padding: 4px 10px; border-radius: 12px;">Falta: ${stats.falta}</span>
          </div>
        </div>
      `;
    });
  }

  function renderAlertChips(categories) {
    alertCategoryChips.innerHTML = '';

    const orderedCategories = categories.filter(c => c !== 'Todas');
    orderedCategories.unshift('Todas');

    orderedCategories.forEach(cat => {
      const chip = document.createElement('div');
      chip.className = `chip ${activeAlertCategory === cat ? 'active' : ''}`;
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        activeAlertCategory = cat;
        renderAlertChips(orderedCategories);
        renderAlerts(currentAlerts);
      });
      alertCategoryChips.appendChild(chip);
    });
  }

  function renderAlerts(alertas) {
    alertasList.innerHTML = '';

    let filteredAlerts = alertas;
    if (activeAlertCategory !== 'Todas') {
      filteredAlerts = alertas.filter(item => item.categoria === activeAlertCategory);
    }

    filteredAlerts.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    if (filteredAlerts.length === 0) {
      emptyState.classList.remove('hidden');
      alertasList.style.display = 'none';
    } else {
      emptyState.classList.add('hidden');
      alertasList.style.display = 'flex';

      filteredAlerts.forEach(item => {
        alertasList.innerHTML += `
          <div style="background: #fce8e6; border-left: 4px solid #c5221f; padding: 12px 16px; border-radius: 4px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div>
                <span style="font-size: 11px; color: #5f6368; font-weight: bold; display: block; margin-bottom: 2px;">SKU: ${item.sku} | <span style="color:#1a73e8;">${item.categoria}</span></span>
                <span style="font-weight: 500; color: #1a1a1a; font-size: 15px;">${item.nome}</span>
              </div>
              <span style="color: #c5221f; font-weight: bold; font-size: 13px; background: #fad2cf; padding: 4px 8px; border-radius: 12px; white-space: nowrap;">Falta: ${item.deficit}</span>
            </div>
            <span style="font-size: 12px; color: #d93025; margin-top: 4px;">Estoque atual: ${item.quantidade} / Ideal: ${item.ideal} ${item.unidade}</span>
          </div>
        `;
      });
    }
  }

  // Exportar Lista de Reposição em PDF (jsPDF + AutoTable)
  function exportToPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Biblioteca de PDF ainda carregando. Aguarde 2 segundos e tente novamente.');
      return;
    }

    let itemsToExport = currentAlerts;
    if (activeAlertCategory !== 'Todas') {
      itemsToExport = currentAlerts.filter(item => item.categoria === activeAlertCategory);
    }

    if (itemsToExport.length === 0) {
      alert('Não há itens em alerta de reposição nesta categoria para exportar.');
      return;
    }

    itemsToExport = [...itemsToExport].sort((a, b) => {
      if (activeAlertCategory === 'Todas') {
        const catComp = a.categoria.localeCompare(b.categoria, 'pt-BR');
        if (catComp !== 0) return catComp;
      }
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Dados da última contagem (específica da categoria ou geral)
    const countInfo = (activeAlertCategory !== 'Todas' && globalData.lastCountByCat && globalData.lastCountByCat[activeAlertCategory])
      ? globalData.lastCountByCat[activeAlertCategory]
      : (globalData.lastCount || { responsavel: 'N/A', data: 'Sem registro' });

    const hoje = new Date();
    const dataDownload = hoje.toLocaleDateString('pt-BR');
    const horaDownload = hoje.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const totalUnidadesFaltantes = itemsToExport.reduce((acc, item) => acc + item.deficit, 0);

    // Cabeçalho do PDF
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Terreiro de Macumba Vó Quitéria e Dona Rosa Caveira', 14, 16);

    doc.setFontSize(11);
    doc.setTextColor(197, 34, 31);
    doc.text(`Lista de Compras / Reposição — Categoria: ${activeAlertCategory}`, 14, 23);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Emitido em: ${dataDownload} às ${horaDownload}`, 14, 30);
    doc.text(`Última contagem (${activeAlertCategory}): ${countInfo.responsavel} — ${countInfo.data}`, 14, 35);
    doc.text(`Total de itens em alerta: ${itemsToExport.length} | Total em falta: ${totalUnidadesFaltantes}`, 14, 40);

    const tableRows = itemsToExport.map(item => [
      item.sku,
      item.nome,
      item.categoria,
      `${item.quantidade} / ${item.ideal} ${item.unidade}`,
      `${item.deficit} ${item.unidade}`
    ]);

    doc.autoTable({
      startY: 46,
      head: [['SKU', 'Produto', 'Categoria', 'Atual / Ideal', 'Comprar']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [197, 34, 31],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [30, 41, 59]
      },
      alternateRowStyles: {
        fillColor: [254, 242, 242]
      },
      styles: {
        cellPadding: 3,
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 34 },
        3: { cellWidth: 34, halign: 'center' },
        4: { cellWidth: 26, halign: 'center', fontStyle: 'bold' }
      }
    });

    const catSlug = activeAlertCategory
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .toLowerCase();
    const dateSlug = dataDownload.replace(/\//g, '-');

    doc.save(`Lista_Reposicao_TUM_${catSlug}_${dateSlug}.pdf`);
  }

  window.loadData = loadData;
  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadData);
  }
  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', exportToPDF);
  }

  loadData();
});
