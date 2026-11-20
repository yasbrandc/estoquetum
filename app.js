// app.js

document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btnRefresh');
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

  // Busca a última linha preenchida diretamente na aba Fato_Contagem
  async function fetchLastCountFromSheet() {
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

      // Percorre de baixo para cima para pegar o último registro válido
      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const resp = respIdx !== -1 ? (row[respIdx] || '').toString().trim() : '';
        const rawDate = dataIdx !== -1 ? (row[dataIdx] || '').toString().trim() : '';

        if (resp || rawDate) {
          return {
            responsavel: resp || 'N/A',
            data: formatarDataHora(rawDate) || 'Sem registro'
          };
        }
      }
    } catch (err) {
      console.warn('Não foi possível ler Fato_Contagem diretamente:', err);
    }
    return null;
  }

  function formatarDataHora(valor) {
    if (!valor) return '';
    // Se vier no formato ISO ou YYYY-MM-DD HH:MM:SS
    const matchISO = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (matchISO) {
      const [, ano, mes, dia, hora, min, seg] = matchISO;
      if (hora && min) {
        return `${dia}/${mes}/${ano} ${hora}:${min}${seg ? ':' + seg : ''}`;
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

      // Sistema anti-cache para garantir leitura imediata
      const separador = CONFIG.APPS_SCRIPT_URL.includes('?') ? '&' : '?';
      const urlAtualizado = CONFIG.APPS_SCRIPT_URL + separador + 'nocache=' + new Date().getTime();

      // Busca em paralelo o dashboard do Apps Script e a última contagem da aba Fato_Contagem
      const [response, sheetLastCount] = await Promise.all([
        fetch(urlAtualizado),
        fetchLastCountFromSheet()
      ]);

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

      const apiLastCount = (data.lastCount && data.lastCount.responsavel && data.lastCount.responsavel !== 'N/A')
        ? data.lastCount
        : null;

      globalData = {
        items: itensRecebidos,
        lastCount: sheetLastCount || apiLastCount || { responsavel: 'N/A', data: 'Sem registro' }
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
      // Buscador inteligente de colunas (ignora espaços extras da planilha)
      const keys = Object.keys(item);
      const skuKey = keys.find(k => k.includes('sku') || k.includes('codigo')) || 'sku';
      const nomeKey = keys.find(k => k.includes('nome') || k.includes('produto')) || 'nome';
      const catKey = keys.find(k => k.includes('categoria')) || 'categoria';
      const idealKey = keys.find(k => k.includes('estoque') && k.includes('ideal')) || 'estoque_ideal';
      const qtdKey = keys.find(k => k.includes('quantidade') || k.includes('atual')) || 'quantidade_atual';
      const statusKey = keys.find(k => k.includes('status')) || 'status';

      const sku = item[skuKey] || '';
      const nome = item[nomeKey] || '';

      // Ignora linhas totalmente vazias
      if (!sku && !nome) return;

      const categoria = item[catKey] && item[catKey].toString().trim() !== '' ? item[catKey].trim() : 'Sem Categoria';
      const quantidade = Number(item[qtdKey]) || 0;
      const ideal = Number(item[idealKey]) || 0;
      const statusStr = item[statusKey] ? item[statusKey].toString().toLowerCase() : '';

      catSet.add(categoria);
      totalItensDisponiveis += quantidade;

      // Agrupar estatísticas por categoria
      if (!categoriasMap[categoria]) {
        categoriasMap[categoria] = { disponivel: 0, falta: 0, totalItens: 0 };
      }
      categoriasMap[categoria].disponivel += quantidade;
      categoriasMap[categoria].totalItens++;

      // Verificar se está em falta
      if (quantidade < ideal || statusStr.includes('esgotado') || statusStr.includes('alerta')) {
        const deficit = Math.max(0, ideal - quantidade);
        categoriasMap[categoria].falta += deficit;

        alertas.push({
          sku: sku || 'N/A',
          nome: nome || 'Produto sem nome',
          quantidade: quantidade,
          ideal: ideal,
          categoria: categoria
        });
      }
    });

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

    // Força o chip "Todas" a ser o primeiro
    const orderedCategories = categories.filter(c => c !== 'Todas');
    orderedCategories.unshift('Todas');

    orderedCategories.forEach(cat => {
      const chip = document.createElement('div');
      chip.className = `chip ${activeAlertCategory === cat ? 'active' : ''}`;
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        activeAlertCategory = cat;
        renderAlertChips(orderedCategories);
        processDashboardData(); // Recarrega os alertas filtrados
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
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span style="font-size: 11px; color: #5f6368; font-weight: bold; display: block; margin-bottom: 2px;">SKU: ${item.sku} | <span style="color:#1a73e8;">${item.categoria}</span></span>
                <span style="font-weight: 500; color: #1a1a1a; font-size: 15px;">${item.nome}</span>
              </div>
              <span style="color: #c5221f; font-weight: bold; font-size: 13px; background: #fad2cf; padding: 4px 8px; border-radius: 12px; white-space: nowrap;">Qtd: ${item.quantidade}</span>
            </div>
            <span style="font-size: 12px; color: #d93025; margin-top: 4px;">Estoque ideal: ${item.ideal}</span>
          </div>
        `;
      });
    }
  }

  window.loadData = loadData;
  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadData);
  }

  loadData();
});
