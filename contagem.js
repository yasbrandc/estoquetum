// contagem.js

document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btnRefresh');
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const dataView = document.getElementById('dataView');
  const productList = document.getElementById('productList');
  const errorMsg = document.getElementById('errorMsg');
  const saveBar = document.getElementById('saveBar');
  const btnSave = document.getElementById('btnSave');
  const savingOverlay = document.getElementById('savingOverlay');
  
  const inputResponsavel = document.getElementById('inputResponsavel');
  const inputData = document.getElementById('inputData');
  const inputSearch = document.getElementById('inputSearch');
  const categoryChips = document.getElementById('categoryChips');

  let currentProducts = [];
  let counts = {};
  let categoriesList = [];
  let activeCategory = 'Todas';
  let searchQuery = '';

  // Set default date to today
  const today = new Date();
  inputData.value = today.toISOString().split('T')[0];

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

  async function loadData() {
    showState('loading');
    btnRefresh.classList.add('spinning');
    btnRefresh.disabled = true;
    saveBar.classList.add('hidden');

    try {
      if (!CONFIG.GOOGLE_SHEETS_API_KEY || !CONFIG.SPREADSHEET_ID || !CONFIG.DIM_PRODUTOS_SHEET) {
        throw new Error('Configuração pendente no config.js');
      }

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.DIM_PRODUTOS_SHEET}?key=${CONFIG.GOOGLE_SHEETS_API_KEY}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
      if (!data.values || data.values.length === 0) {
        throw new Error('A aba Dim_Produtos está vazia.');
      }

      processProducts(data.values);

    } catch (error) {
      console.error(error);
      errorMsg.textContent = error.message;
      showState('error');
    } finally {
      btnRefresh.classList.remove('spinning');
      btnRefresh.disabled = false;
    }
  }

  function processProducts(rows) {
    const headers = rows[0].map(h => h.toString().toLowerCase().trim());
    
    const skuIndex = headers.findIndex(h => h.includes('sku') || h.includes('código') || h.includes('codigo'));
    const nameIndex = headers.findIndex(h => h.includes('nome') || h.includes('produto') || h.includes('descrição') || h.includes('descricao'));
    const umIndex = headers.findIndex(h => h.includes('unidade') || h.includes('um') || h.includes('u.m'));
    const categoryIndex = headers.findIndex(h => h.includes('categoria') || h.includes('grupo') || h.includes('tipo'));

    if (skuIndex === -1 || nameIndex === -1) {
      throw new Error('Não foi possível encontrar colunas SKU e Nome na aba ' + CONFIG.DIM_PRODUTOS_SHEET);
    }

    currentProducts = [];
    counts = {}; 
    const catSet = new Set();

    const dataRows = rows.slice(1);
    dataRows.forEach(row => {
      if (!row || row.length === 0 || (!row[skuIndex] && !row[nameIndex])) return;
      
      const sku = row[skuIndex] || 'N/A';
      const cat = categoryIndex !== -1 ? (row[categoryIndex] || 'Sem Categoria') : 'Sem Categoria';
      
      currentProducts.push({
        sku: sku,
        name: row[nameIndex] || 'Produto sem nome',
        um: umIndex !== -1 ? (row[umIndex] || 'UN') : 'UN',
        category: cat
      });
      counts[sku] = 0; 
      catSet.add(cat);
    });

    // Ordenar produtos alfabeticamente
    currentProducts.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    // Ordenar categorias alfabeticamente
    categoriesList = ['Todas', ...Array.from(catSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
    
    activeCategory = 'Todas';
    searchQuery = '';
    inputSearch.value = '';

    renderChips();
    renderProducts();
    showState('data');
    saveBar.classList.remove('hidden');
  }

  function renderChips() {
    categoryChips.innerHTML = '';
    categoriesList.forEach(cat => {
      const chip = document.createElement('div');
      chip.className = `chip ${activeCategory === cat ? 'active' : ''}`;
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        activeCategory = cat;
        renderChips();
        renderProducts();
      });
      categoryChips.appendChild(chip);
    });
  }

  function renderProducts() {
    productList.innerHTML = '';
    
    // Aplicar filtros
    let filtered = currentProducts;
    
    if (activeCategory !== 'Todas') {
      filtered = filtered.filter(p => p.category === activeCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      productList.innerHTML = '<p style="text-align:center; padding: 24px; color: var(--text-secondary);">Nenhum produto encontrado.</p>';
      return;
    }

    // Agrupar por categoria apenas para organizar visualmente (se "Todas" estiver selecionada)
    const grouped = {};
    filtered.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    // Renderizar cada grupo
    Object.keys(grouped).sort().forEach(categoryName => {
      
      // Mostrar header de categoria apenas se estiver na aba "Todas"
      if (activeCategory === 'Todas') {
        const headerEl = document.createElement('div');
        headerEl.className = 'category-header';
        headerEl.innerHTML = `<i class="icon-lucide lucide-tag"></i> ${categoryName}`;
        productList.appendChild(headerEl);
      }

      // Itens da Categoria
      grouped[categoryName].forEach(item => {
        const isBottle = item.um.toLowerCase().includes('garrafa') || item.um.toLowerCase() === 'gf' || item.name.toLowerCase().includes('garrafa');
        const step = isBottle ? 0.5 : 1;

        const card = document.createElement('div');
        card.className = 'counter-item';
        
        card.innerHTML = `
          <div class="counter-header">
            <div class="counter-title-group">
              <span class="counter-sku">SKU: ${item.sku}</span>
              <span class="counter-name">${item.name}</span>
            </div>
            <span class="counter-unit">${item.um}</span>
          </div>
          <div class="counter-controls">
            <button type="button" class="btn-count btn-minus" data-sku="${item.sku}" data-step="${step}" aria-label="Remover">
              -
            </button>
            <input 
              type="number" 
              class="count-input" 
              id="count-${item.sku}" 
              data-sku="${item.sku}" 
              value="${counts[item.sku]}" 
              min="0" 
              step="${step}" 
              inputmode="decimal"
              aria-label="Quantidade de ${item.name}"
            >
            <button type="button" class="btn-count btn-plus" data-sku="${item.sku}" data-step="${step}" aria-label="Adicionar">
              +
            </button>
          </div>
        `;
        productList.appendChild(card);
      });
    });

    // Evento para digitação manual no campo numérico
    document.querySelectorAll('.count-input').forEach(input => {
      // Seleciona todo o número ao tocar/clicar para facilitar a digitação rápida
      input.addEventListener('focus', (e) => {
        e.target.select();
      });

      input.addEventListener('input', (e) => {
        const sku = e.target.getAttribute('data-sku');
        const rawValue = e.target.value.replace(',', '.');
        
        if (rawValue === '') {
          counts[sku] = 0;
          return;
        }

        const parsed = parseFloat(rawValue);
        if (!isNaN(parsed) && parsed >= 0) {
          counts[sku] = parsed;
        } else {
          counts[sku] = 0;
        }
      });

      // Garante que o campo nunca fique vazio ou negativo ao sair dele
      input.addEventListener('blur', (e) => {
        const sku = e.target.getAttribute('data-sku');
        const rawValue = e.target.value.replace(',', '.');
        const parsed = parseFloat(rawValue);

        if (isNaN(parsed) || parsed < 0) {
          counts[sku] = 0;
        } else {
          counts[sku] = parsed;
        }
        e.target.value = counts[sku];
      });
    });

    // Eventos dos botões - e + sincronizados com o input
    document.querySelectorAll('.btn-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sku = e.currentTarget.getAttribute('data-sku');
        const step = parseFloat(e.currentTarget.getAttribute('data-step')) || 1;
        const currentVal = Number(counts[sku]) || 0;
        
        if (currentVal > 0) {
          // Arredonda para evitar imprecisão de ponto flutuante (ex: 1.5 - 0.5)
          counts[sku] = Math.max(0, Math.round((currentVal - step) * 100) / 100);
          document.getElementById(`count-${sku}`).value = counts[sku];
        }
      });
    });

    document.querySelectorAll('.btn-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sku = e.currentTarget.getAttribute('data-sku');
        const step = parseFloat(e.currentTarget.getAttribute('data-step')) || 1;
        const currentVal = Number(counts[sku]) || 0;
        
        counts[sku] = Math.round((currentVal + step) * 100) / 100;
        document.getElementById(`count-${sku}`).value = counts[sku];
      });
    });
  }

  async function handleSave() {
    const responsavel = inputResponsavel.value.trim();
    const dataSelecionada = inputData.value;

    if (!responsavel) {
      alert("Por favor, preencha o Nome do Responsável antes de salvar.");
      inputResponsavel.focus();
      return;
    }

    if (!CONFIG.APPS_SCRIPT_URL) {
      alert("ATENÇÃO: O link do Apps Script (APPS_SCRIPT_URL) não foi configurado no config.js!");
      return;
    }

    // Filtrar apenas itens que tiveram contagem maior que 0
    const itemsToSave = currentProducts
      .filter(item => counts[item.sku] > 0)
      .map(item => ({
        sku: item.sku,
        name: item.name,
        quantity: counts[item.sku]
      }));

    if (itemsToSave.length === 0) {
      alert("Nenhum item foi contado (todos estão com quantidade zero).");
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      responsavel: responsavel,
      data: dataSelecionada,
      items: itemsToSave
    };

    savingOverlay.style.display = 'flex';

    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload)
      });

      alert('Contagem salva com sucesso!');
      
      // Resetar contagens (mantendo nome e data)
      Object.keys(counts).forEach(k => counts[k] = 0);
      renderProducts();
      window.scrollTo(0, 0);
      
    } catch (error) {
      console.error(error);
      alert('Erro de rede ao tentar salvar a contagem.');
    } finally {
      savingOverlay.style.display = 'none';
    }
  }

  // Attach events
  window.loadData = loadData;
  btnRefresh.addEventListener('click', loadData);
  btnSave.addEventListener('click', handleSave);

  inputSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderProducts();
  });

  // Initial load
  loadData();
});