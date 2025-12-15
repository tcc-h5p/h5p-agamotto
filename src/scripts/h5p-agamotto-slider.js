import Util from '@services/h5p-agamotto-util';

/** @constant {number} LUCKY_FOUR Some offset, but not sure why that value. */
const LUCKY_FOUR = 4;

/** @constant {number} TICK_BUFFER_FALLBACK Fallback for tick buffer. */
const TICK_BUFFER_FALLBACK = 7;

// Slider Layout
/** @constant {number} CONTAINER_DEFAULT_HEIGHT Default container height. */
const CONTAINER_DEFAULT_HEIGHT = 36;

/** @constant {number} TRACK_OFFSET Offset for the track. */
const TRACK_OFFSET = 16;

/** @constant {number} THUMB_OFFSET Offset for the thumb. */
const THUMB_OFFSET = 8;

/** Class representing a Slider */
export default class Slider extends H5P.EventDispatcher {
  /**
   * Slider object.
   * @param {object} params Options for the slider.
   * @param {boolean} [params.snap] If true, slider will snap to fixed positions.
   * @param {boolean} [params.ticks] If true, slider container will display ticks.
   * @param {boolean} [params.labels] If true, slider container will display tick labels.
   * @param {number} [params.startRatio] Set the start ratio.
   * @param {object[]} params.labelTexts Tick labels.
   * @param {string} params.labelTexts.text Tick label.
   * @param {number} params.size Number of positions/ticks.
   * @param {string} params.selector CSS class name of parent node.
   * @param {object} params.parent Parent class Agamotto.
   * @param {object} callbacks Callbacks.
   * @param {function} [callbacks.onButtonFullscreenClicked] Fullscreen button clicked.
   */
  constructor(params, callbacks = {}) {
    super();

    this.params = Util.extend({
      snap: true,
      ticks: false,
      labels: false,
      startRatio: 0,
    }, params);

    this.callbacks = callbacks;
    this.callbacks.onButtonFullscreenClicked = callbacks.onButtonFullscreenClicked || (() => {});

    this.selector = params.selector;
    this.parent = params.parent;

    this.trackWidth = 0;
    this.audioButtonOffset = 0;
    this.thumbPosition = 0;
    this.ratio = params.startRatio;

    this.ticks = [];
    this.labels = [];

    this.sliderdown = false;
    this.keydown = false;
    this.interactionstarted = false;
    this.extraInitResizes = 1;

    this.gridEnabled = false;
    this.gridElement = null;

    this.rulerEnabled = false;
    this.rulerElement = null;
    this.isRulerVertical = false;

    this.container = document.createElement('div');
    this.container.classList.add('h5p-agamotto-slider-container');

    if (this.params.audio) {
      this.muted = false;
      this.audioButton = document.createElement('button');
      this.audioButton.classList.add('h5p-agamotto-slider-button');
      this.audioButton.classList.add('h5p-agamotto-slider-audio-unmuted');
      this.audioButton.setAttribute('tabindex', 0);
      this.audioButton.setAttribute('aria-label', this.params.a11y.mute);
      this.audioButtonOffset = 28; // Magic number, extra offset for audio button
      this.audioButton.addEventListener('click', (event) => {
        this.handleClickAudioButton(event);
      });
      this.audioButton.addEventListener('touchstart', (event) => {
        this.handleClickAudioButton(event);
      });
      this.container.appendChild(this.audioButton);
    }

    this.updateTableContent = (index, textContent) => {
      if (this.currentTableEl && this.currentTableEl.parentNode) {
        this.currentTableEl.parentNode.removeChild(this.currentTableEl);
      }
    }

    this.menuButton = document.createElement('button');
    this.menuButton.classList.add('h5p-agamotto-slider-menu');
    this.menuButton.setAttribute('tabindex', 0);
    this.menuButton.setAttribute('aria-label', 'Abrir menu lateral');
    this.menuButton.innerHTML = '☰';

    this.menuButton.addEventListener('click', (event) => {
      event.preventDefault(); 
      console.log('Menu panel:', this.menuPanel);
      this.toggleMenuPanel();
    });

    this.container.appendChild(this.menuButton);

    this.menuPanel = document.createElement('div');
    this.menuPanel.classList.add('h5p-agamotto-slider-menu-panel');

    const menuItems = [
      { label: 'Mostrar Régua', action: 'toggleRuler' },
      { label: 'Mostrar Quadriculado', action: 'toggleGrid' },
      { label: 'Habilitar Zoom', action: 'setZoom', value: 0.5 },
      { label: 'Redefinir Zoom', action: 'resetZoom' },
      { label: 'Exportar Tabela', action: 'showExportOptions' },
      { label: 'Exportar Perguntas e Respostas', action: 'exportQuestions' },
      { label: 'Exportar Tudo', action: 'exportAll' } 
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('button');
      menuItem.classList.add('h5p-agamotto-slider-menu-item');
      menuItem.textContent = item.label;

      menuItem.addEventListener('click', () => {
        if (item.action === 'toggleRuler') {
          this.toggleRuler();
          menuItem.textContent = this.rulerEnabled
            ? 'Esconder Régua'
            : 'Mostrar Régua';
        }
        if (item.action === 'toggleGrid') {
          this.toggleGrid();
          menuItem.textContent = this.gridEnabled
          ? 'Esconder Quadriculado'
          : 'Mostrar Quadriculado';
        }
        if (item.action == 'showExportOptions') this.showExportOptions();
        if (item.action === 'exportQuestions') this.exportQuestions();
        if (item.action == 'exportAll') this.exportAll();
        if (item.action === 'setZoom') this.setZoom(item.value);
        if (item.action === 'resetZoom') this.resetZoom();
    
      });

      this.menuPanel.appendChild(menuItem);
    });

    this.container.appendChild(this.menuPanel);

    this.track = document.createElement('div');
    this.track.classList.add('h5p-agamotto-slider-track');
    this.container.appendChild(this.track);

    this.thumb = document.createElement('div');
    this.thumb.classList.add('h5p-agamotto-slider-thumb');
    this.thumb.setAttribute('tabindex', 0);
    this.thumb.setAttribute('role', 'slider');
    this.thumb.setAttribute('aria-label', this.params.a11y.imageSlider);
    this.container.appendChild(this.thumb);

    this.fullscreenButton = document.createElement('button');
    this.fullscreenButton.classList.add('h5p-agamotto-slider-button');
    this.fullscreenButton.classList.add('h5p-agamotto-slider-fullscreen');
    this.fullscreenButton.classList.add('h5p-agamotto-slider-fullscreen-enter');
    this.fullscreenButton.setAttribute('aria-label', this.params.a11y.buttonFullscreenEnter);
    this.fullscreenButton.classList.add('h5p-agamotto-button-none');
    this.fullscreenButton.setAttribute('tabindex', 0);
    this.fullscreenButton.addEventListener('click', (event) => {
      this.handleClickFullscreenButton(event);
    });
    this.fullscreenButton.addEventListener('touchstart', (event) => {
      this.handleClickFullscreenButton(event);
    });
    this.container.appendChild(this.fullscreenButton);

    /*
     * We could put the next two blocks in one loop and check for ticks/labels
     * within the loop, but then we would always loop all images even without
     * ticks and labels. Would be slower (with many images).
     */
    let i = 0;
    // Place ticks
    if (this.params.ticks === true) {
      // Function used here to avoid creating it in the upcoming loop
      const placeTicks = (event) => {
        this.setPosition(parseInt(event.target.style.left) - TRACK_OFFSET - this.audioButtonOffset, true);
      };
      for (i = 0; i <= this.params.size; i++) {
        this.ticks[i] = document.createElement('div');
        this.ticks[i].classList.add('h5p-agamotto-tick');
        this.ticks[i].addEventListener('click', placeTicks);
        this.container.appendChild(this.ticks[i]);
      }
    }

    // Place labels
    if (this.params.labels === true) {
      for (i = 0; i <= this.params.size; i++) {
        this.labels[i] = document.createElement('div');
        this.labels[i].classList.add('h5p-agamotto-tick-label');
        this.labels[i].setAttribute('aria-hidden', 'true');
        this.labels[i].innerHTML = this.params.labelTexts[i];
        this.container.appendChild(this.labels[i]);
      }
    }

    this.tableContent = params.tableContent || ''
    this.timeData = params.timeData || [];

    this.updateTimeDisplay = (index) => {
      const entry = this.timeData?.[index];

      if (!entry) {
        this.timeText.innerText = '';
        return;
      }

      if (entry.enabled) {
        if (!false) {
          document.querySelectorAll('.h5p-agamotto-time-panel').forEach(panel => panel.remove());
          this.timePanel = document.createElement('div');
          this.timePanel.classList.add('h5p-agamotto-time-panel');

          this.timeText = document.createElement('div');
          this.timeText.classList.add('h5p-agamotto-time-item');
          this.timePanel.appendChild(this.timeText);

          const imageIndices = this.params.contentType
            .map((isTable, i) => isTable == 'image' ? i : -1)
            .filter(i => i !== -1);

          const imageIndex = imageIndices.indexOf(index);
          const start = entry.start + (entry.delta * imageIndex);

          this.timeText.innerText = `${start.toFixed(3)} ${entry.unit}`;
          this.container.appendChild(this.timePanel);
        } else {
          document.querySelectorAll('.h5p-agamotto-time-panel').forEach(panel => panel.remove());
        }
      }
    };
    
    // Event Listeners for Mouse Interface
    document.addEventListener('mousemove', (event) => {
      if (this.sliderdown) {
        this.setPosition(event, false);
      }
    });
    document.addEventListener('mouseup', () => {
      if (this.sliderdown) {
        this.sliderdown = false;
        this.snap();
      }
    });
    this.track.addEventListener('mousedown', (event) => {
      this.sliderdown = true;
      this.setPosition(event, false);
    });
    this.thumb.addEventListener('mousedown', (event) => {
      this.sliderdown = true;
      this.setPosition(event, false);
    });

    /*
     * Event Listeners for Touch Interface
     * Using preventDefault here causes Chrome to throw a "violation". Blocking
     * the default behavior for touch is said to cause performance issues.
     * However, if you don't use preventDefault, people will also slide the
     * screen when using the slider which would be weird.
     */
    this.container.addEventListener('touchstart', (event) => {
      if (event.target === this.fullscreenButton || event.target === this.audioButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.setPosition(event, false);
    });

    this.container.addEventListener('touchmove', (event) => {
      if (event.target === this.fullscreenButton || event.target === this.audioButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.setPosition(event, false);
    });

    this.container.addEventListener('touchend', (event) => {
      if (event.target === this.fullscreenButton || event.target === this.audioButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.snap();
    });

    this.thumb.addEventListener('keydown', (event) => {
      // Prevent repeated pressing of a key
      if (this.keydown !== false) {
        return;
      }

      switch (event.code) {
        case 'End':
          this.handleKeyMove(event, this.params.size);
          break;

        case 'Home':
          this.handleKeyMove(event, 0);
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
          this.handleKeyMove(event, this.getCurrentItemId(true) - 1);
          break;

        case 'ArrowRight':
        case 'ArrowDown':
          this.handleKeyMove(event, this.getCurrentItemId(true) + 1);
          break;
      }
    });

    this.thumb.addEventListener('keyup', (event) => {
      // Only trigger xAPI if the interaction started by a particular key has ended
      if (event.code === this.keydown) {
        this.parent.xAPIInteracted();
        this.parent.xAPICompleted();
      }

      this.keydown = false;
    });
  }

  /**
   * Detect whether audio is muted.
   * @returns {boolean} True, if muted.
   */
  isMuted() {
    return this.muted;
  }

  /**
   * Handle click/tap on fullscreen button.
   * @param {Event} event Click/Touchstart event.
   * @returns {boolean} False.
   */
  handleClickFullscreenButton(event) {
    event.preventDefault();
    this.callbacks.onButtonFullscreenClicked();
    return false;
  }

  /**
   * Enable fullscreen button.
   */
  enableFullscreenButton() {
    this.fullscreenButton.classList.remove('h5p-agamotto-button-none');
  }

  /**
   * 
   * Show export options in menu
   */
  showExportOptions() {
    let exportOptions = this.menuPanel.querySelector('.export-options');

    if (exportOptions) {
      exportOptions.classList.toggle('open');
      return;
    }

    exportOptions = document.createElement('div');
    exportOptions.classList.add('export-options');

    const exportTypes = [
      { label: 'Texto (.txt)', format: 'text' },
      { label: 'CSV (.csv)', format: 'csv' },
      { label: 'HTML (.html)', format: 'html' }
    ];

    exportTypes.forEach(type => {
      const optionBtn = document.createElement('button');
      optionBtn.classList.add('h5p-agamotto-slider-menu-item');
      optionBtn.textContent = type.label;

      optionBtn.addEventListener('click', () => {
        this.exportTable(type.format);
        exportOptions.classList.remove('open');
      });

      exportOptions.appendChild(optionBtn);
    });

    this.menuPanel.appendChild(exportOptions);
    requestAnimationFrame(() => exportOptions.classList.add('open'));
  }

  exportTable(format = 'text') {
    const currentIndex = this.getCurrentItemId();
    const currentItem = this.parent.params.items[currentIndex];
    const htmlContent = currentItem?.image?.params?.text;
    
    if (htmlContent) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      
      const table = tempDiv.querySelector('figure.table table') || tempDiv.querySelector('table');
      
      if (table) {
        const tableData = [];        
        const allRows = table.querySelectorAll('tr');
        
        allRows.forEach(row => {
          const cells = row.querySelectorAll('th, td');
          const rowData = [];
          
          cells.forEach(cell => {
            const cellText = (cell.textContent || cell.innerText || '').replace(/\s+/g, ' ').trim();
            rowData.push(cellText);
          });
          
          if (rowData.length > 0) {
            tableData.push(rowData);
          }
        });
        
        if (tableData.length === 0) {
          alert('Tabela vazia.');
          return;
        }
        
        let content = '';
        let mimeType = '';
        let fileExtension = '';
        
        switch (format) {
          case 'csv':
            const csvRows = tableData.map(row => {
              return row.map(cell => {
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                  return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
              }).join(',');
            });
            content = csvRows.join('\n');
            mimeType = 'text/csv;charset=utf-8';
            fileExtension = 'csv';
            break;
            
          case 'html':
            let htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>Tabela - Slide ${currentIndex + 1}</title>
                <style>
                  table { border-collapse: collapse; width: 100%; }
                  th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                  th { background-color: #f2f2f2; }
                </style>
              </head>
              <body>
                <h1>Tabela - Slide ${currentIndex + 1}</h1>
                <table>
            `;
            
            tableData.forEach((row, rowIndex) => {
              htmlContent += '<tr>';
              row.forEach(cell => {
                const tag = rowIndex === 0 ? 'th' : 'td';
                htmlContent += `<${tag}>${cell}</${tag}>`;
              });
              htmlContent += '</tr>';
            });
            
            htmlContent += `
                </table>
              </body>
              </html>
            `;
            
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            return;
            
          case 'text':
          default:
            const textRows = tableData.map(row => row.join('\t'));
            content = textRows.join('\n');
            mimeType = 'text/plain;charset=utf-8';
            fileExtension = 'txt';
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tabela_slide_${currentIndex + 1}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('Nenhuma tabela encontrada neste slide.');
      }
    } else {
      alert('Nenhum conteúdo encontrado neste slide.');
    }
    this.toggleMenuPanel();
  }

  /**
   * Export questions 
   */
  exportQuestions() {
    const items = this.parent.params.items;
    let content = 'Perguntas e Respostas\n==================\n\n';

    items.forEach((item, index) => {
      const lib = item?.image?.library || '';
      if (lib.includes('H5P.OpenEndedQuestion')) {
        const questionText = item.image.params.question || 'Pergunta não disponível';
        let answer = 'Não respondida';

        if (this.parent.questionInstances && this.parent.questionInstances[index]) {
          answer = this.parent.questionInstances[index].getCurrentState() || 'Não respondida';
        }

        content += `Pergunta ${index + 1}:\n${questionText}\nResposta:\n${answer}\n\n---\n\n`;
      }
    });

    if (content.includes('Pergunta')) {
      this.downloadTextFile(content, 'perguntas_respostas.txt');
    } else {
      alert('Nenhuma pergunta encontrada.');
    }
    this.toggleMenuPanel();
  }

  downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Remove fullscreen button.
   */
  removeFullscreenButton() {
    this.container.removeChild(this.fullscreenButton);
    this.resize();
  }

  /**
   * Set fullscreen title.
   * @param {boolean} state If true, fullscreen entered, else exited.
   */
  setFullScreenButtonTitle(state) {
    if (!this.fullscreenButton) {
      return;
    }

    if (state) {
      this.fullscreenButton.setAttribute('aria-label', this.params.a11y.buttonFullscreenExit);
    }
    else {
      this.fullscreenButton.setAttribute('aria-label', this.params.a11y.buttonFullscreenEnter);
    }
  }

  /**
   * Handle click/tap on audio button.
   * @param {Event} event Click/Touchstart event.
   * @returns {boolean} False.
   */
  handleClickAudioButton(event) {
    event.preventDefault();
    this.toggleAudioButton();
    return false;
  }

  /**
   * Toggle audio button.
   * @param {boolean} [muted] Override for audio button.
   */
  toggleAudioButton(muted) {
    if (!this.audioButton) {
      return;
    }

    if (typeof muted === 'boolean') {
      this.muted = !muted;
    }

    if (this.isMuted()) {
      this.audioButton.classList.remove('h5p-agamotto-slider-audio-muted');
      this.audioButton.classList.add('h5p-agamotto-slider-audio-unmuted');
      this.audioButton.setAttribute('aria-label', this.params.a11y.mute);
      this.trigger('unmuted');
      this.muted = false;
    }
    else {
      this.muted = true;
      this.trigger('muted');
      this.audioButton.classList.remove('h5p-agamotto-slider-audio-unmuted');
      this.audioButton.classList.add('h5p-agamotto-slider-audio-muted');
      this.audioButton.setAttribute('aria-label', this.params.a11y.unmute);
    }
  }

  /**
   * Handle sliding with keys.
   * @param {Event} event Key event.
   * @param {number} nextItemId Id of item to slide to.
   */
  handleKeyMove(event, nextItemId) {
    event.preventDefault();
    this.keydown = event.code;
    nextItemId = Util.constrain(nextItemId, 0, this.params.size);

    this.setPosition(Util.project(nextItemId, 0, this.params.size, 0, this.getWidth()), true);
  }

  handleTouchMove(event) {
    event.preventDefault();
    event.stopPropagation();
    this.setPosition(event, false);
  }

  /**
   * Get id of current item pointed at by slider.
   * @param {boolean} [rounded] If true, position will be rounded.
   * @returns {number} Id of item pointed at. Can be a float.
   */
  getCurrentItemId(rounded = true) {
    let itemPosition = this.getPosition() / this.getWidth() * this.params.size;
    if (rounded) {
      itemPosition = Util.constrain(0, Math.round(itemPosition), this.params.size);
    }
    return itemPosition;
  }

  /**
   * Get the DOM elements.
   * @returns {HTMLElement} The DOM elements.
   */
  getDOM() {
    return this.container;
  }

  /**
   * Disable the slider
   */
  disable() {
    this.track.classList.add('h5p-agamotto-disabled');
    this.thumb.classList.add('h5p-agamotto-disabled');
  }

  /**
   * Enable the slider.
   */
  enable() {
    this.track.classList.remove('h5p-agamotto-disabled');
    this.thumb.classList.remove('h5p-agamotto-disabled');
  }

  /**
   * Open menu
   */
  toggleMenuPanel() {
    this.menuPanel.classList.toggle('open');

    if (!this.menuPanel.classList.contains('open')) {
      const exportOptions = this.menuPanel.querySelector('.export-options');
      if (exportOptions) {
        exportOptions.classList.remove('open');
      }
    }
  }

  /**
   * Grid
   */
  toggleGrid() {
    this.gridEnabled = !this.gridEnabled;
    
    if (this.gridEnabled) {
      this.createGrid();
      this.updateGridSize();
    } else {
      this.removeGrid();
    }
    
    this.toggleMenuPanel();
  }

  /**
   * 
   * Create Grid
   */
  createGrid() {
    if (this.gridElement) return;
    
    this.gridElement = document.createElement('div');
    this.gridElement.className = 'h5p-agamotto-grid';
    this.gridElement.classList.add('h5p-agamotto-grid')

    const dpi = window.devicePixelRatio * 96;

    const pxPerMM = dpi / 25.4;
    document.documentElement.style.setProperty('--mm', `${pxPerMM}px`);
    document.documentElement.style.setProperty('--cm', `${pxPerMM * 10}px`);
    
    const agamottoContainer = this.container.closest('.h5p-agamotto') || document.body;
    agamottoContainer.style.position = 'relative';
    agamottoContainer.appendChild(this.gridElement);
  }

  /**
   * Update grid size 
   */
  updateGridSize() {
    if (this.gridElement && this.gridEnabled) {
      const agamottoContainer = this.container.closest('.h5p-agamotto');
      if (agamottoContainer) {
        this.gridElement.style.width = agamottoContainer.offsetWidth + 'px';
        this.gridElement.style.height = agamottoContainer.offsetHeight + 'px';
      }
    }
  }

  /**
   * Remove grid
   */
  removeGrid() {
    if (this.gridElement) {
      this.gridElement.remove();
      this.gridElement = null;
    }
  }

  /**
   * Ruler
   */
  toggleRuler() {
    this.rulerEnabled = !this.rulerEnabled;
    
    if (this.rulerEnabled) {
      this.createMovableRuler();
    } else {
      this.removeRuler();
    }
    
    this.toggleMenuPanel();
  }

  createMovableRuler() {
    if (this.rulerElement) return;
    
    this.rulerElement = document.createElement('div');
    this.rulerElement.className = 'h5p-agamotto-movable-ruler';
    
    this.updateRulerOrientation();
    
    const agamottoContainer = this.container.closest('.h5p-agamotto') || document.body;
    agamottoContainer.style.position = 'relative';
    agamottoContainer.appendChild(this.rulerElement);

    const rotateHandle = document.createElement('div');
    rotateHandle.classList.add('rotate-handle');
    
    this.setupRulerInteractions();
  }

  measurePixelsPerCm() {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = '-1000px';
    div.style.top = '-1000px';
    div.style.width = '1cm';
    div.style.height = '1cm';
    document.body.appendChild(div);

    const pixels = div.getBoundingClientRect().width;
    document.body.removeChild(div);
    return pixels;
  }


  updateRulerOrientation() {
    if (!this.rulerElement) return;

    const pixelsPerCm = this.measurePixelsPerCm();
    const length = 500;

    if (this.isRulerVertical) {
      this.rulerElement.style.width = '24px';
      this.rulerElement.style.height = length + 'px';
      this.rulerElement.style.transform = 'rotate(0deg)';

      this.rulerElement.innerHTML = '';
      for (let cm = 0; cm <= Math.floor(length / pixelsPerCm); cm++) {
        const tickPosition = Math.round(cm * pixelsPerCm);
        const tick = document.createElement('div');
        tick.style.cssText = `
          position: absolute;
          top: ${tickPosition}px;
          left: 0;
          width: 8px;
          height: 1px;
          background: white;
        `;
        this.rulerElement.appendChild(tick);

        if (cm % 5 === 0) {
          const labelPosition = Math.round(tickPosition - 8);
          const label = document.createElement('div');
          label.textContent = cm;
          label.style.cssText = `
            position: absolute;
            top: ${labelPosition}px;
            left: 12px;
            color: white;
            font-size: 12px;
            transform: rotate(-90deg);
            transform-origin: left top;
          `;
          this.rulerElement.appendChild(label);
        }
      }
    } else {
      this.rulerElement.style.width = length + 'px';
      this.rulerElement.style.height = '24px';
      this.rulerElement.style.transform = 'rotate(0deg)';

      this.rulerElement.innerHTML = '';
      for (let cm = 0; cm <= Math.floor(length / pixelsPerCm); cm++) {
        const tickPosition = Math.round(cm * pixelsPerCm);
        const tick = document.createElement('div');
        tick.style.cssText = `
          position: absolute;
          left: ${tickPosition}px;
          top: 0;
          width: 1px;
          height: 8px;
          background: white;
        `;
        this.rulerElement.appendChild(tick);

        if (cm % 5 === 0) {
          const labelPosition = Math.round(tickPosition + 2);
          const label = document.createElement('div');
          label.textContent = cm;
          label.style.cssText = `
            position: absolute;
            left: ${labelPosition}px;
            top: 10px;
            color: white;
            font-size: 10px;
          `;
          this.rulerElement.appendChild(label);
        }
      }
    }
  }

  setupRulerInteractions() {
    let isDragging = false;
    let isRotating = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let rulerStartX = 0;
    let rulerStartY = 0;
    let rotationStart = 0;

    const rotateHandle = document.createElement('div');
    rotateHandle.classList.add('rotate-handle');
    this.rulerElement.appendChild(rotateHandle);

    this.angleDisplay = document.createElement('div');
    this.angleDisplay.classList.add('ruler-angle');
    this.angleDisplay.textContent = '0°';
    this.rulerElement.appendChild(this.angleDisplay);

    this.rulerElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target === rotateHandle) return;

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = this.rulerElement.getBoundingClientRect();
      rulerStartX = rect.left;
      rulerStartY = rect.top;

      this.rulerElement.style.cursor = 'grabbing';
      e.preventDefault();
    });

    rotateHandle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      isRotating = true;

      const rect = this.rulerElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const currentAngle = parseFloat(this.rulerElement.dataset.rotation || '0');
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      rotationStart = angle - (currentAngle * Math.PI / 180);
    });

    const mouseMoveHandler = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        const container = this.rulerElement.parentElement;
        const containerRect = container.getBoundingClientRect();
        const rulerRect = this.rulerElement.getBoundingClientRect();

        let newX = rulerStartX + deltaX - containerRect.left;
        let newY = rulerStartY + deltaY - containerRect.top;

        newX = Math.max(0, Math.min(newX, containerRect.width - rulerRect.width));
        newY = Math.max(0, Math.min(newY, containerRect.height - rulerRect.height));

        this.rulerElement.style.left = `${newX}px`;
        this.rulerElement.style.top = `${newY}px`;
      }

      if (isRotating) {
        const rect = this.rulerElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) - rotationStart;
        const degrees = angle * (180 / Math.PI);

        this.rulerElement.style.transform = `rotate(${degrees}deg)`;
        this.rulerElement.dataset.rotation = degrees.toFixed(2);
        this.angleDisplay.textContent = `${degrees.toFixed(1)}°`;
      }
    };

    const mouseUpHandler = () => {
      if (isDragging) {
        isDragging = false;
        this.rulerElement.style.cursor = 'move';
      }
      if (isRotating) {
        isRotating = false;
      }
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);

    this.rulerElement.cleanup = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
  }

  removeRuler() {
    if (this.rulerElement) {
      if (this.rulerElement.cleanup) {
        this.rulerElement.cleanup();
      }
      this.rulerElement.remove();
      this.rulerElement = null;
    }
  }

  drawRulerTicks() {
    if (!this.rulerElement) return;
    
    this.rulerElement.innerHTML = '';
    
    const rulerWidth = this.rulerElement.parentElement.clientWidth;
    const pixelsPerCm = 37.8; // Aproximadamente 37.8 pixels por cm em 96 DPI
    
    for (let cm = 0; cm <= Math.ceil(rulerWidth / pixelsPerCm); cm++) {
      const tick = document.createElement('div');
      tick.style.cssText = `
        position: absolute;
        left: ${cm * pixelsPerCm}px;
        top: 0;
        width: 1px;
        height: 10px;
        background: white;
      `;
      this.rulerElement.appendChild(tick);
      
      if (cm % 5 === 0) {
        const label = document.createElement('div');
        label.textContent = cm;
        label.style.cssText = `
          position: absolute;
          left: ${cm * pixelsPerCm + 2}px;
          top: 10px;
          color: white;
          font-size: 8px;
          white-space: nowrap;
        `;
        this.rulerElement.appendChild(label);
      }
    }
  }

  /**
   * Update ruler position 
   */
  updateRulerPosition() {
    if (this.rulerElement && this.rulerEnabled) {
      const agamottoContainer = this.container.closest('.h5p-agamotto');
      if (agamottoContainer) {
        this.rulerElement.style.width = agamottoContainer.clientWidth + 'px';
        this.drawRulerTicks();
      }
    }
  }

  /**
   * Remove ruler
   */
  removeRuler() {
    if (this.rulerElement) {
      this.rulerElement.remove();
      this.rulerElement = null;
    }
  }

  /**
   * Set the slider's width.
   * @param {number} value Slider's width.
   */
  setWidth(value) {
    if (this.params.audio) {
      this.track.style.left = `${TRACK_OFFSET + this.audioButtonOffset}px`;
    }

    const fullscreenButtonOffset = this.fullscreenButton.offsetWidth + LUCKY_FOUR;

    this.trackWidth = value - this.audioButtonOffset - fullscreenButtonOffset;
    this.track.style.width = `${value - this.audioButtonOffset - fullscreenButtonOffset}px`;
  }

  /**
   * Get the slider's width.
   * @returns {number} Slider's width.
   */
  getWidth() {
    return this.trackWidth;
  }

  /**
   * Set the position of the thumb on the slider track.
   * @param {number} position Position on the slider track from 0 to max.
   * @param {boolean} animate If true, slide instead of jumping.
   * @param {boolean} resize If true, won't recompute position/width ratio.
   */
  setPosition(position, animate, resize) {
    if (this.thumb.classList.contains('h5p-agamotto-disabled')) {
      return;
    }

    // Compute position from string (e.g. 1px), from number (e.g. 1), or from event
    if ((typeof position === 'string') || (typeof position === 'number')) {
      position = parseInt(position);
    }
    else if (typeof position === 'object') {
      position = this.getPointerX(position) - this.computeTrackOffset() - this.audioButtonOffset;
    }
    else {
      position = 0;
    }
    position = Util.constrain(position, 0, this.getWidth());

    // Transition control
    if (animate === true) {
      this.thumb.classList.add('h5p-agamotto-transition');
    }
    else {
      this.thumb.classList.remove('h5p-agamotto-transition');
    }

    // We need to keep a fixed ratio not influenced by resizing
    if (!resize) {
      this.ratio = position / this.getWidth();
    }

    // Update DOM
    this.thumb.style.left = `${position + THUMB_OFFSET + this.audioButtonOffset  }px`;
    const percentage = Math.round(position / this.getWidth() * 100);
    const currentItemId = (this.getCurrentItemId() || 0);

    this.thumb.setAttribute(
      'aria-valuetext',
      this.params.labels ?
        this.labels[currentItemId].innerHTML :
        this.params.altTitleTexts[currentItemId] || `${this.params.a11y.image} ${currentItemId + 1}`,
    );

    // Inform parent node
    this.trigger('update', {
      position: position,
      percentage: percentage,
    });
  }

  /**
   * Get the current slider position.
   * @returns {number} Current slider position.
   */
  getPosition() {
    return (this.thumb.style.left) ? parseInt(this.thumb.style.left) - THUMB_OFFSET : 0;
  }

  /**
   * Get current slider down state.
   * @returns {boolean} True, if slider is in usw.
   */
  isUsed() {
    return this.sliderdown;
  }

  /**
   * Focus slider.
   * @param {object} [options] regular element.focus options.
   */
  focus(options = {}) {
    this.thumb.focus(options);
  }

  /**
   * Snap slider to closest tick position.
   */
  snap() {
    if (this.params.snap === true) {
      const snapIndex = Math.round(Util.project(this.ratio, 0, 1, 0, this.params.size));
      this.setPosition(snapIndex * this.getWidth() / this.params.size, true);
    }

    // Won't pass object and context if invoked by Agamotto.prototype.xAPI...()
    // Trigger xAPI when interacted with content
    this.parent.xAPIInteracted();
    // Will check if interaction was completed before triggering
    this.parent.xAPICompleted();
  }

  /**
   * Get the horizontal position of the pointer/finger.
   * @param {Event} e Delivering event.
   * @returns {number} Horizontal pointer/finger position.
   */
  getPointerX(e) {
    let pointerX = 0;
    if (e.touches) {
      pointerX = e.touches[0].pageX;
    }
    else {
      pointerX = e.clientX;
    }
    return pointerX;
  }

  /**
   * Resize the slider.
   */
  resize() {
    if (
      // eslint-disable-next-line no-magic-numbers
      this.getWidth() === parseInt(this.container.offsetWidth) - 2 * TRACK_OFFSET && this.extraInitResizes < 0
    ) {
      return; // Skip, already correct width
    }

    this.extraInitResizes--;

    // eslint-disable-next-line no-magic-numbers
    this.setWidth(parseInt(this.container.offsetWidth) - 2 * TRACK_OFFSET);
    this.setPosition(this.getWidth() * this.ratio, false, true);

    let i = 0;
    // Update ticks
    if (this.params.ticks === true) {
      for (i = 0; i < this.ticks.length; i++) {
        this.ticks[i].style.left =
          `${TRACK_OFFSET + this.audioButtonOffset + i * this.getWidth() / (this.ticks.length - 1) }px`;
      }
    }
    // Height to enlarge the slider container
    let maxLabelHeight = 0;
    let overlapping = false;

    // Update labels
    if (this.params.labels === true) {
      for (i = 0; i < this.labels.length; i++) {
        maxLabelHeight = Math.max(maxLabelHeight, parseInt(window.getComputedStyle(this.labels[i]).height));

        // Align the first and the last label left/right instead of centered
        switch (i) {
          case (0):
            // First label
            // eslint-disable-next-line no-magic-numbers
            this.labels[i].style.left = `${(TRACK_OFFSET / 2) + this.audioButtonOffset  }px`;
            break;
          case (this.labels.length - 1):
            // Last label
            // eslint-disable-next-line no-magic-numbers
            this.labels[i].style.right = `${(TRACK_OFFSET / 2) + this.fullscreenButton.offsetWidth + 4  }px`;
            break;
          default:
            // Centered over tick mark position
            // eslint-disable-next-line no-magic-numbers
            const offset = Math.ceil(parseInt(window.getComputedStyle(this.labels[i]).width)) / 2;
            const trackOffset = TRACK_OFFSET + i * this.getWidth() / (this.labels.length - 1);
            this.labels[i].style.left = `${trackOffset - offset + this.audioButtonOffset}px`;
        }

        // Detect overlapping labels
        if (i < this.labels.length - 1 && !overlapping) {
          overlapping = (this.areOverlapping(this.labels[i], this.labels[i + 1]));
        }
      }

      // Hide labels if some of them overlap and remove their vertical space
      if (overlapping) {
        this.labels.forEach((label) => {
          label.classList.add('h5p-agamotto-hidden');
        });
        maxLabelHeight = 0;
      }
      else {
        this.labels.forEach((label) => {
          label.classList.remove('h5p-agamotto-hidden');
        });
      }

      // If there are no ticks, put the labels a little closer to the track
      const buffer = (this.params.ticks === true || overlapping || maxLabelHeight === 0) ? 0 : -TICK_BUFFER_FALLBACK;

      // Update slider height
      this.container.style.height = `${CONTAINER_DEFAULT_HEIGHT + maxLabelHeight + buffer  }px`;
    }
  }

  /**
   * Compute offset for setting slider track zero position.
   * @returns {number} Track offset.
   */
  computeTrackOffset() {
    const questionContainer = Util.findClosest(this.container, 'h5p-question-content');
    if (questionContainer) {
      const style = window.getComputedStyle(questionContainer);

      const sliderOffset = (this.container.offsetLeft === TRACK_OFFSET) ?
        TRACK_OFFSET :
        TRACK_OFFSET + this.container.offsetLeft;

      return questionContainer.getBoundingClientRect().left +
        parseInt(style.paddingLeft) +
        sliderOffset;
    }
    else { // Fallback
      return this.container.offsetLeft + TRACK_OFFSET;
    }
  }

  /**
   * Detect overlapping labels
   * @param {HTMLElement} label1 Label 1.
   * @param {HTMLElement} label2 Label 2.
   * @returns {boolean} True if labels are overlapping.
   */
  areOverlapping(label1, label2) {
    const rect1 = label1.getBoundingClientRect();
    const rect2 = label2.getBoundingClientRect();
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }
}
