/**
 * ai-copilot.js - Safety Assistant AI Copilot
 * Native Google Gemini (100% Free Tier via Google AI Studio) & OpenAI (ChatGPT Platform)
 * Equipped with function calling to query local databases, inspect PPE,
 * check safety compliance, lookup employees, and control app navigation.
 */

class AICopilotEngine {
  constructor(db) {
    this.db = db;

    // Load provider and keys
    this.provider = localStorage.getItem('sa_ai_provider') || 'google';
    this.googleApiKey = localStorage.getItem('sa_google_api_key') || '';
    this.openaiApiKey = localStorage.getItem('sa_openai_api_key') || '';

    // Auto-migrate legacy key if it starts with AIza
    if (!this.googleApiKey && this.openaiApiKey && this.openaiApiKey.startsWith('AIza')) {
      this.googleApiKey = this.openaiApiKey;
      localStorage.setItem('sa_google_api_key', this.googleApiKey);
    }

    let savedModel = localStorage.getItem('sa_copilot_model');
    // Auto-migrate retired Gemini 1.5 / 2.0 models to 3.8-flash
    if (savedModel && (savedModel.includes('1.5') || savedModel.includes('2.0'))) {
      savedModel = 'gemini-3.8-flash';
      localStorage.setItem('sa_copilot_model', savedModel);
    }
    this.model = savedModel || (this.provider === 'google' ? 'gemini-3.8-flash' : 'gpt-4o-mini');
    this.apiKey = this.provider === 'google' ? this.googleApiKey : this.openaiApiKey;

    this.messages = [];
    this.isOpen = false;
    this.isProcessing = false;
    this.speechRecognition = null;
    this.isListening = false;

    // Load persisted chat history if any
    try {
      const saved = sessionStorage.getItem('sa_copilot_session_history');
      if (saved) {
        this.messages = JSON.parse(saved);
      }
    } catch {
      this.messages = [];
    }
  }

  init() {
    this.initSpeechRecognition();
    this.renderDrawer();
    this.setupListeners();
    this.updateModelBadge();
  }

  // =========================================================================
  // Speech Recognition (Voice Input)
  // =========================================================================
  initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        this.speechRecognition = new SpeechRec();
        this.speechRecognition.continuous = false;
        this.speechRecognition.interimResults = false;
        this.speechRecognition.lang = 'en-US';

        this.speechRecognition.onresult = (e) => {
          const transcript = e.results[0][0].transcript;
          const inputEl = document.getElementById('ai-copilot-input');
          if (inputEl) {
            inputEl.value = (inputEl.value ? inputEl.value + ' ' : '') + transcript;
            inputEl.focus();
          }
          this.setListening(false);
        };

        this.speechRecognition.onerror = (err) => {
          console.warn('Speech recognition error:', err);
          this.setListening(false);
        };

        this.speechRecognition.onend = () => {
          this.setListening(false);
        };
      } catch (e) {
        console.warn('Could not initialize speech recognition:', e);
      }
    }
  }

  toggleVoiceInput() {
    if (!this.speechRecognition) {
      alert('Speech recognition is not supported in this browser environment.');
      return;
    }
    if (this.isListening) {
      this.speechRecognition.stop();
      this.setListening(false);
    } else {
      try {
        this.speechRecognition.start();
        this.setListening(true);
      } catch (err) {
        console.warn('Speech recognition start failed:', err);
        this.setListening(false);
      }
    }
  }

  setListening(isListening) {
    this.isListening = isListening;
    const micBtn = document.getElementById('ai-copilot-mic-btn');
    if (micBtn) {
      if (isListening) {
        micBtn.classList.add('listening');
        micBtn.title = 'Listening... Click to stop';
      } else {
        micBtn.classList.remove('listening');
        micBtn.title = 'Speak prompt (Speech to Text)';
      }
    }
  }

  // =========================================================================
  // Drawer Open / Close / Toggle
  // =========================================================================
  toggleDrawer() {
    if (this.isOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  openDrawer() {
    this.isOpen = true;
    const drawer = document.getElementById('ai-copilot-drawer');
    const backdrop = document.getElementById('ai-copilot-backdrop');
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');

    this.scrollToBottom();

    setTimeout(() => {
      const inputEl = document.getElementById('ai-copilot-input');
      if (inputEl) inputEl.focus();
    }, 150);

    if (!this.getActiveApiKey()) {
      this.showNoApiKeyNotice();
    }
  }

  closeDrawer() {
    this.isOpen = false;
    const drawer = document.getElementById('ai-copilot-drawer');
    const backdrop = document.getElementById('ai-copilot-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (this.isListening && this.speechRecognition) {
      this.speechRecognition.stop();
      this.setListening(false);
    }
  }

  getActiveApiKey() {
    return this.provider === 'google' ? this.googleApiKey : this.openaiApiKey;
  }

  updateModelBadge() {
    const badge = document.getElementById('ai-copilot-model-badge');
    if (badge) {
      const providerIcon = this.provider === 'google' ? '🔵 Google' : '🟢 OpenAI';
      badge.textContent = `${providerIcon} • ${this.model}`;
    }
  }

  // =========================================================================
  // Settings Management
  // =========================================================================
  openSettingsModal() {
    const modal = document.getElementById('ai-copilot-settings-modal');
    this.renderSettingsModalContent(this.provider);
    if (modal) modal.style.display = 'flex';
  }

  closeSettingsModal() {
    const modal = document.getElementById('ai-copilot-settings-modal');
    if (modal) modal.style.display = 'none';
  }

  setSettingsProvider(provider) {
    this.renderSettingsModalContent(provider);
  }

  renderSettingsModalContent(provider) {
    const activeProvider = provider || this.provider;
    const key = activeProvider === 'google' ? this.googleApiKey : this.openaiApiKey;
    const defaultModel = activeProvider === 'google' ? 'gemini-3.8-flash' : 'gpt-4o-mini';
    const currentModel = (this.provider === activeProvider && this.model && !this.model.includes('1.5') && !this.model.includes('2.0')) ? this.model : defaultModel;

    const googleBtn = document.getElementById('ai-provider-btn-google');
    const openaiBtn = document.getElementById('ai-provider-btn-openai');
    if (googleBtn && openaiBtn) {
      if (activeProvider === 'google') {
        googleBtn.className = 'ai-provider-tab active';
        openaiBtn.className = 'ai-provider-tab';
      } else {
        googleBtn.className = 'ai-provider-tab';
        openaiBtn.className = 'ai-provider-tab active';
      }
    }

    const keyLabel = document.getElementById('ai-copilot-key-label');
    const keyInput = document.getElementById('ai-copilot-api-key-input');
    const keyLink = document.getElementById('ai-copilot-key-link');
    const modelSelect = document.getElementById('ai-copilot-model-select');
    const providerInfo = document.getElementById('ai-copilot-provider-info');
    const statusMsg = document.getElementById('ai-copilot-settings-status');

    if (statusMsg) {
      statusMsg.textContent = '';
      statusMsg.style.display = 'none';
    }

    if (keyLabel) {
      keyLabel.innerHTML = activeProvider === 'google'
        ? 'Google Gemini API Key <span style="color: #34d399; font-size: 11px; font-weight: normal; margin-left: 6px;">(100% Free Tier Available)</span>'
        : 'OpenAI API Key <span style="color: #f87171; font-size: 11px; font-weight: normal; margin-left: 6px;">(Requires Prepaid API Credits)</span>';
    }

    if (keyInput) {
      keyInput.value = key;
      keyInput.placeholder = activeProvider === 'google' ? 'AIzaSy... (Paste Google AI Studio Key)' : 'sk-proj-... (Paste OpenAI Key)';
    }

    if (keyLink) {
      if (activeProvider === 'google') {
        keyLink.href = 'https://aistudio.google.com/app/apikey';
        keyLink.textContent = 'Get Free Google Key (1-Click) ↗';
      } else {
        keyLink.href = 'https://platform.openai.com/api-keys';
        keyLink.textContent = 'Get OpenAI Key ↗';
      }
    }

    if (modelSelect) {
      if (activeProvider === 'google') {
        modelSelect.innerHTML = `
          <option value="gemini-3.8-flash">gemini-3.8-flash (Latest Workhorse, High Intelligence & 100% Free — Recommended)</option>
          <option value="gemini-3.8-flash-lite">gemini-3.8-flash-lite (Ultralight, High Throughput, 100% Free)</option>
          <option value="gemini-3.7-flash">gemini-3.7-flash (Multi-step Reasoning & Coding, 100% Free)</option>
        `;
      } else {
        modelSelect.innerHTML = `
          <option value="gpt-4o-mini">gpt-4o-mini (Fastest, Smart & Most Cost-Effective — Recommended)</option>
          <option value="gpt-4o">gpt-4o (High Intelligence Multimodal)</option>
          <option value="gpt-4-turbo">gpt-4-turbo (Legacy High Capacity)</option>
        `;
      }
      modelSelect.value = currentModel;
    }

    if (providerInfo) {
      if (activeProvider === 'google') {
        providerInfo.innerHTML = `
          <div style="font-size: 11.5px; font-weight: 700; color: #34d399; margin-bottom: 4px;">🎉 Google AI Studio Free Tier:</div>
          <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.5; margin-bottom: 8px;">
            Google offers <strong>15 requests per minute and 1 million tokens per minute completely free</strong> for personal & team development. No credit card required.
          </div>
          <div style="font-size: 11px; color: #93c5fd; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; padding: 6px 10px; line-height: 1.4;">
            💡 <strong>Crucial Tip:</strong> In Google AI Studio, click <strong>"Create API key"</strong> and select <strong>"Create API key in NEW project"</strong>. This generates an unrestricted key starting with <code>AIzaSy...</code> rather than an enterprise-restricted token.
          </div>
        `;
      } else {
        providerInfo.innerHTML = `
          <div style="font-size: 11.5px; font-weight: 700; color: #93c5fd; margin-bottom: 4px;">ℹ️ OpenAI Platform Note:</div>
          <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.5;">
            OpenAI requires adding a prepaid credit balance (minimum $5) at <a href="https://platform.openai.com/settings/organization/billing" target="_blank" style="color: #60a5fa;">platform.openai.com billing</a> to use developer APIs.
          </div>
        `;
      }
    }
  }

  toggleKeyVisibility() {
    const input = document.getElementById('ai-copilot-api-key-input');
    const btn = document.getElementById('ai-copilot-eye-btn');
    if (!input || !btn) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  }

  async testConnection(provider, testKey, testModel) {
    const p = provider || this.provider;
    const key = (testKey || (p === 'google' ? this.googleApiKey : this.openaiApiKey) || '').trim();
    const model = testModel || (p === 'google' ? 'gemini-3.8-flash' : 'gpt-4o-mini');

    if (!key) {
      return { success: false, message: `Please enter your ${p === 'google' ? 'Google Gemini' : 'OpenAI'} API key first.` };
    }

    if (p === 'google') {
      // Test native Google Gemini generateContent endpoint
      try {
        // Try query parameter first (standard API key format AIzaSy...)
        let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with the single word "Ready"' }] }],
            generationConfig: { maxOutputTokens: 10 }
          })
        });

        // If 401 unauthenticated, try Bearer header (for AQ.* tokens)
        if (res.status === 401) {
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Respond with the single word "Ready"' }] }],
              generationConfig: { maxOutputTokens: 10 }
            })
          });
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg = data?.error?.message || `HTTP error ${res.status}`;
          const errDetails = JSON.stringify(data?.error?.details || []);
          if (errDetails.includes('API_KEY_SERVICE_BLOCKED') || errMsg.includes('API_KEY_SERVICE_BLOCKED')) {
            return {
              success: false,
              message: 'This Google Cloud project has Generative Language blocked. In Google AI Studio, click "Create API key in NEW project" to create an unrestricted AIzaSy key.'
            };
          }
          if (errDetails.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
            return {
              success: false,
              message: 'This key requires OAuth. In Google AI Studio, click "Create API key in NEW project" to generate a standard AIzaSy key.'
            };
          }
          if (errMsg.includes('prepayment credits') || errMsg.includes('billing#prepay')) {
            return {
              success: false,
              message: 'This key belongs to a project with Google Cloud billing attached, which disables the Free Tier. To use the 100% Free Tier without paying, create an API key in a project with NO billing linked (click "Create API key in NEW project" in AI Studio).'
            };
          }
          if (errMsg.includes('is no longer available') || errMsg.includes('not found for API version')) {
            return {
              success: false,
              message: `${errMsg} (Tip: Select gemini-3.8-flash from the AI Model dropdown).`
            };
          }
          return { success: false, message: errMsg };
        }

        return { success: true, message: `Connected successfully to Google Gemini (${model})! Ready to assist.` };
      } catch (err) {
        return { success: false, message: `Network request failed: ${err.message}` };
      }
    } else {
      // Test OpenAI chat/completions endpoint
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Respond with the single word "Ready"' }],
            max_tokens: 5
          })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg = data?.error?.message || `HTTP error ${res.status}`;
          return { success: false, message: errMsg };
        }

        return { success: true, message: `Connected successfully to OpenAI (${model})! Ready to assist.` };
      } catch (err) {
        return { success: false, message: `Network request failed: ${err.message}` };
      }
    }
  }

  async handleSaveSettings() {
    const keyInput = document.getElementById('ai-copilot-api-key-input');
    const modelSelect = document.getElementById('ai-copilot-model-select');
    const statusMsg = document.getElementById('ai-copilot-settings-status');

    const key = keyInput ? keyInput.value.trim() : '';

    let targetProvider = this.provider;
    const activeTab = document.querySelector('.ai-provider-tab.active');
    if (activeTab && activeTab.dataset.provider) {
      targetProvider = activeTab.dataset.provider;
    }

    if (key.startsWith('AIza')) targetProvider = 'google';
    if (key.startsWith('sk-')) targetProvider = 'openai';

    const model = modelSelect ? modelSelect.value : (targetProvider === 'google' ? 'gemini-3.8-flash' : 'gpt-4o-mini');

    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.style.color = '#93c5fd';
      statusMsg.textContent = `⏳ Testing connection with ${targetProvider === 'google' ? 'Google Gemini' : 'OpenAI'}...`;
    }

    const testRes = await this.testConnection(targetProvider, key, model);
    if (!testRes.success) {
      if (statusMsg) {
        statusMsg.style.color = '#f87171';
        statusMsg.textContent = '❌ ' + testRes.message;
      }
      return;
    }

    // Save
    this.provider = targetProvider;
    this.model = model;
    if (targetProvider === 'google') {
      this.googleApiKey = key;
      localStorage.setItem('sa_google_api_key', key);
    } else {
      this.openaiApiKey = key;
      localStorage.setItem('sa_openai_api_key', key);
    }
    this.apiKey = key;
    localStorage.setItem('sa_ai_provider', targetProvider);
    localStorage.setItem('sa_copilot_model', model);
    this.updateModelBadge();

    if (statusMsg) {
      statusMsg.style.color = '#34d399';
      statusMsg.textContent = '✅ ' + testRes.message;
    }

    setTimeout(() => {
      this.closeSettingsModal();
      this.renderMessages();
    }, 900);
  }

  clearChat() {
    this.messages = [];
    sessionStorage.removeItem('sa_copilot_session_history');
    this.renderMessages();
  }

  showNoApiKeyNotice() {
    const container = document.getElementById('ai-copilot-messages');
    if (!container) return;

    if (document.getElementById('ai-no-key-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'ai-no-key-banner';
    banner.className = 'ai-copilot-notice-box';
    banner.innerHTML = `
      <div style="font-weight: 700; color: #34d399; font-size: 13.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
        <span>✨</span> Connect Free Google Gemini or OpenAI
      </div>
      <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 12px; line-height: 1.5;">
        Activate Safety Assistant Copilot using a <strong>100% free Google Gemini API key</strong> (no credit card required) or your OpenAI platform key.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="window.aiCopilotEngine.openSettingsModal()" style="font-size: 11.5px; padding: 6px 12px; font-weight: 700; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);">
          ⚙️ Enter API Key
        </button>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="font-size: 11.5px; padding: 6px 12px; color: #34d399; border-color: rgba(52, 211, 153, 0.4); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
          <span>🔗</span> Get Free Google Key ↗
        </a>
      </div>
    `;
    container.appendChild(banner);
    this.scrollToBottom();
  }

  // =========================================================================
  // Tool Calling Implementations (Programmatic Safety Assistant Access)
  // =========================================================================
  getToolsDefinition() {
    return [
      {
        type: 'function',
        function: {
          name: 'lookup_employee',
          description: 'Search for an employee by name or ID. Returns contact details, location, crew, trade classification, status, and all assigned PPE items with expiration dates.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The employee full or partial name (e.g. "Chris Sugrue", "Cody")'
              }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_inventory',
          description: 'Search equipment inventory across gloves, sleeves, blankets, macks, hv_testers, phasing_sets, aed, grounds, or hot_sticks. Can filter by status, size, class rating, and location.',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['all', 'gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'],
                description: 'The equipment category to search. Default is "all".'
              },
              status: {
                type: 'string',
                description: 'Filter by status (e.g. "Assigned", "In Stock", "Testing", "Damaged", "Lost")'
              },
              location: {
                type: 'string',
                description: 'Filter by city location (e.g. "Helena", "Bozeman", "Great Falls")'
              },
              size: {
                type: 'string',
                description: 'Filter by size (e.g. "10", "10H", "11")'
              },
              class_rating: {
                type: 'string',
                description: 'Filter by electrical class rating (e.g. "0", "2", "3")'
              },
              search_text: {
                type: 'string',
                description: 'Keyword, serial number, item #, or ESL barcode ID'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_due_swaps',
          description: 'Find equipment due for change-out or overdue for re-testing. Grouped by location and employee.',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['all', 'gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'],
                description: 'Category to check, or "all"'
              },
              timeframe: {
                type: 'string',
                enum: ['overdue', 'due_this_month', 'due_next_month', 'all_upcoming'],
                description: 'Timeframe filter. "overdue" returns expired items. "due_this_month" returns items expiring within 30 days.'
              },
              location: {
                type: 'string',
                description: 'Filter by location city (e.g. "Bozeman", "Helena")'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_active_crews',
          description: 'Get information about active crews from Job Tracking, including crew foreman/lead, job number, project site name, work schedule, skip days, and roster members.',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'Filter by city (e.g. "Helena", "Bozeman")'
              },
              search_query: {
                type: 'string',
                description: 'Job number or crew lead name'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_safety_compliance',
          description: 'Check Safety Compliance submissions for active crews (JHAs, weekly safety meetings, monthly vehicle checklists).',
          parameters: {
            type: 'object',
            properties: {
              crew_name: {
                type: 'string',
                description: 'Specific crew to check'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'filter_table',
          description: 'Directly apply live filters to the visible Safety Assistant inventory table on screen.',
          parameters: {
            type: 'object',
            properties: {
              sheet_key: {
                type: 'string',
                description: 'Sheet to switch to (e.g. "gloves", "sleeves", "blankets", "employees", "job_tracking")'
              },
              search_text: {
                type: 'string',
                description: 'Search keyword to type into the search bar'
              },
              size: {
                type: 'string',
                description: 'Size filter value'
              },
              class_rating: {
                type: 'string',
                description: 'Class filter value'
              },
              location: {
                type: 'string',
                description: 'Location filter value'
              },
              status: {
                type: 'string',
                description: 'Status filter value'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'navigate_to',
          description: 'Navigate to any workspace or sheet inside Safety Assistant.',
          parameters: {
            type: 'object',
            properties: {
              view_id: {
                type: 'string',
                enum: [
                  'sheets-view',
                  'weekly-summary-view',
                  'tailgate-generator-view',
                  'crew-import-view',
                  'safety-compliance-view',
                  'incident-reports-view',
                  'expiring-certs-view',
                  'training-view',
                  'drug-testing-view',
                  'previous-employees-view',
                  'history-view',
                  'trip-planner-view',
                  'tasks-view',
                  'lookup-view',
                  'procurement-view',
                  'aging-view',
                  'settings-view'
                ],
                description: 'The target workspace view'
              },
              sheet_tab: {
                type: 'string',
                description: 'Optional tab name if navigating to sheets-view (e.g. "employees", "gloves", "sleeves", "job_tracking")'
              }
            },
            required: ['view_id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'open_employee_profile',
          description: 'Open the detailed Employee Profile dossier modal on screen for a given employee name.',
          parameters: {
            type: 'object',
            properties: {
              employee_name: {
                type: 'string',
                description: 'Exact or close match of employee name'
              },
              tab: {
                type: 'string',
                enum: ['equipment', 'certs', 'history', 'details'],
                description: 'Initial tab to open in the profile modal'
              }
            },
            required: ['employee_name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_system_status',
          description: 'Get an overview of current database sync status, total equipment count, active worker count, and pending offline mutations.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      }
    ];
  }

  convertSchemaForGemini(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    const res = {};
    for (const k of Object.keys(schema)) {
      if (k === 'type' && typeof schema[k] === 'string') {
        res[k] = schema[k].toUpperCase();
      } else if (k === 'properties' && typeof schema[k] === 'object') {
        res[k] = {};
        for (const p of Object.keys(schema[k])) {
          res[k][p] = this.convertSchemaForGemini(schema[k][p]);
        }
      } else if (k === 'items' && typeof schema[k] === 'object') {
        res[k] = this.convertSchemaForGemini(schema[k]);
      } else {
        res[k] = schema[k];
      }
    }
    return res;
  }

  async executeToolCall(toolCall) {
    const fnName = toolCall.function.name;
    let args = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      args = {};
    }

    try {
      switch (fnName) {
        case 'lookup_employee':
          return this.toolLookupEmployee(args);
        case 'search_inventory':
          return this.toolSearchInventory(args);
        case 'get_due_swaps':
          return this.toolGetDueSwaps(args);
        case 'get_active_crews':
          return this.toolGetActiveCrews(args);
        case 'get_safety_compliance':
          return this.toolGetSafetyCompliance(args);
        case 'filter_table':
          return this.toolFilterTable(args);
        case 'navigate_to':
          return this.toolNavigateTo(args);
        case 'open_employee_profile':
          return this.toolOpenEmployeeProfile(args);
        case 'get_system_status':
          return this.toolGetSystemStatus(args);
        default:
          return { error: `Tool "${fnName}" is not implemented.` };
      }
    } catch (err) {
      console.error(`Error executing tool ${fnName}:`, err);
      return { error: `Execution error in ${fnName}: ${err.message}` };
    }
  }

  // --- Tool Implementations ---

  toolLookupEmployee(args) {
    const query = String(args.name || '').trim().toLowerCase();
    if (!query) return { error: 'Please specify an employee name to look up.' };

    const empTable = this.db.getTable('employees');
    const rows = empTable.rows || [];

    const matches = rows.filter(r => {
      const name = String(r['Employee Name'] || r['Name'] || '').toLowerCase();
      return name.includes(query);
    });

    if (matches.length === 0) {
      return { found: false, message: `No active employees found matching "${args.name}".` };
    }

    const emp = matches[0];
    const empName = emp['Employee Name'] || emp['Name'];

    const assignedEquipment = [];
    const ppeCategories = [
      { key: 'gloves', label: 'Gloves', itemCol: 'Item #' },
      { key: 'sleeves', label: 'Sleeves', itemCol: 'Item #' },
      { key: 'blankets', label: 'Blankets', itemCol: 'Item #' },
      { key: 'macks', label: 'MACKs', itemCol: 'Item #' },
      { key: 'hv_testers', label: 'HV Testers', itemCol: 'Item #' },
      { key: 'phasing_sets', label: 'Phasing Sets', itemCol: 'Item #' },
      { key: 'aed', label: 'AED', itemCol: 'Item #' },
      { key: 'grounds', label: 'Grounds', itemCol: 'Serial #' },
      { key: 'hot_sticks', label: 'Hot Sticks', itemCol: 'Item #' }
    ];

    ppeCategories.forEach(cat => {
      const tbl = this.db.getTable(cat.key);
      if (!tbl || !tbl.rows) return;
      tbl.rows.forEach(item => {
        const assignedTo = String(item['Assigned To'] || '').trim().toLowerCase();
        if (assignedTo === empName.toLowerCase()) {
          assignedEquipment.push({
            type: cat.label,
            itemNum: item[cat.itemCol] || item['Item #'] || item['Serial #'] || 'N/A',
            eslId: item['ESL ID'] || '',
            size: item['Size'] || '',
            classRating: item['Class'] || item['KV'] || '',
            testDate: item['Test Date'] || '',
            changeOutDate: item['Change Out Date'] || item['Change-out Date'] || '',
            status: item['Status'] || 'Assigned',
            location: item['Location'] || ''
          });
        }
      });
    });

    return {
      found: true,
      employee: {
        name: empName,
        location: emp['Location'] || 'Unknown',
        jobNumber: emp['Job Number'] || 'N/A',
        tradeClassification: emp['Trade Classification'] || emp['Classification'] || 'N/A',
        status: emp['Status'] || 'Active',
        phone: emp['Phone'] || emp['Phone Number'] || 'N/A',
        gloveSizePreference: emp['Glove Size'] || 'N/A',
        sleeveSizePreference: emp['Sleeve Size'] || 'N/A',
        notes: emp['Notes'] || ''
      },
      assignedEquipmentCount: assignedEquipment.length,
      assignedEquipment: assignedEquipment,
      allMatches: matches.length > 1 ? matches.map(m => m['Employee Name']) : undefined
    };
  }

  toolSearchInventory(args) {
    const category = args.category || 'all';
    const statusFilter = (args.status || '').toLowerCase().trim();
    const locationFilter = (args.location || '').toLowerCase().trim();
    const sizeFilter = (args.size || '').toLowerCase().trim();
    const classFilter = (args.class_rating || '').toLowerCase().trim();
    const query = (args.search_text || '').toLowerCase().trim();

    const catKeys = category === 'all'
      ? ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks']
      : [category];

    const results = [];

    catKeys.forEach(key => {
      const tbl = this.db.getTable(key);
      if (!tbl || !tbl.rows) return;

      tbl.rows.forEach(row => {
        const itemNum = String(row['Item #'] || row['Serial #'] || '').toLowerCase();
        const eslId = String(row['ESL ID'] || '').toLowerCase();
        const rowStatus = String(row['Status'] || '').toLowerCase();
        const rowLoc = String(row['Location'] || '').toLowerCase();
        const rowSize = String(row['Size'] || '').toLowerCase();
        const rowClass = String(row['Class'] || row['KV'] || '').toLowerCase();
        const assignedTo = String(row['Assigned To'] || '').toLowerCase();
        const notes = String(row['Notes'] || '').toLowerCase();

        if (statusFilter && !rowStatus.includes(statusFilter)) return;
        if (locationFilter && !rowLoc.includes(locationFilter)) return;
        if (sizeFilter && rowSize !== sizeFilter && !rowSize.startsWith(sizeFilter)) return;
        if (classFilter && !rowClass.includes(classFilter)) return;

        if (query) {
          const matchQuery = itemNum.includes(query) ||
            eslId.includes(query) ||
            assignedTo.includes(query) ||
            notes.includes(query);
          if (!matchQuery) return;
        }

        results.push({
          category: key,
          itemNum: row['Item #'] || row['Serial #'] || 'N/A',
          eslId: row['ESL ID'] || '',
          size: row['Size'] || '',
          classRating: row['Class'] || row['KV'] || '',
          status: row['Status'] || 'Active',
          location: row['Location'] || '',
          assignedTo: row['Assigned To'] || 'Unassigned',
          changeOutDate: row['Change Out Date'] || row['Change-out Date'] || '',
          testDate: row['Test Date'] || ''
        });
      });
    });

    return {
      totalFound: results.length,
      sampleItems: results.slice(0, 25),
      hasMore: results.length > 25
    };
  }

  toolGetDueSwaps(args) {
    const timeframe = args.timeframe || 'all_upcoming';
    const locFilter = (args.location || '').toLowerCase().trim();
    const catFilter = args.category || 'all';

    const catKeys = catFilter === 'all'
      ? ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks']
      : [catFilter];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueItems = [];

    catKeys.forEach(cat => {
      const tbl = this.db.getTable(cat);
      if (!tbl || !tbl.rows) return;

      tbl.rows.forEach(item => {
        const rawDate = item['Change Out Date'] || item['Change-out Date'];
        if (!rawDate) return;

        const d = this.parseDate(rawDate);
        if (!d) return;

        const loc = String(item['Location'] || '');
        if (locFilter && !loc.toLowerCase().includes(locFilter)) return;

        const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        let include = false;
        let urgency = 'upcoming';

        if (diffDays < 0) {
          urgency = 'overdue';
          if (timeframe === 'overdue' || timeframe === 'all_upcoming' || timeframe === 'due_this_month') include = true;
        } else if (diffDays <= 30) {
          urgency = 'due_this_month';
          if (timeframe === 'due_this_month' || timeframe === 'all_upcoming') include = true;
        } else if (diffDays <= 60) {
          urgency = 'due_next_month';
          if (timeframe === 'due_next_month' || timeframe === 'all_upcoming') include = true;
        } else {
          if (timeframe === 'all_upcoming') include = true;
        }

        if (include) {
          dueItems.push({
            category: cat,
            itemNum: item['Item #'] || item['Serial #'] || 'N/A',
            assignedTo: item['Assigned To'] || 'Unassigned',
            location: loc,
            size: item['Size'] || '',
            classRating: item['Class'] || item['KV'] || '',
            changeOutDate: rawDate,
            daysRemaining: diffDays,
            urgency: urgency
          });
        }
      });
    });

    dueItems.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return {
      timeframeRequested: timeframe,
      totalCount: dueItems.length,
      overdueCount: dueItems.filter(i => i.daysRemaining < 0).length,
      dueThisMonthCount: dueItems.filter(i => i.daysRemaining >= 0 && i.daysRemaining <= 30).length,
      items: dueItems.slice(0, 30),
      hasMore: dueItems.length > 30
    };
  }

  toolGetActiveCrews(args) {
    const locFilter = (args.location || '').toLowerCase().trim();
    const query = (args.search_query || '').toLowerCase().trim();

    const jtTable = this.db.getTable('job_tracking');
    const empTable = this.db.getTable('employees');

    const crews = (jtTable.rows || []).filter(job => {
      const status = String(job['Status'] || '').toLowerCase();
      if (!status.includes('active') && status !== '') return false;

      const loc = String(job['Location'] || '').toLowerCase();
      if (locFilter && !loc.includes(locFilter)) return false;

      if (query) {
        const jNum = String(job['Job Number'] || '').toLowerCase();
        const lead = String(job['Foreman / Lead'] || job['Lead'] || job['Foreman'] || '').toLowerCase();
        const jName = String(job['Job Name'] || '').toLowerCase();
        if (!jNum.includes(query) && !lead.includes(query) && !jName.includes(query)) return false;
      }
      return true;
    });

    const detailedCrews = crews.map(c => {
      const jNum = String(c['Job Number'] || '').trim();
      const members = (empTable.rows || []).filter(e => String(e['Job Number'] || '').trim() === jNum).map(e => ({
        name: e['Employee Name'] || e['Name'],
        role: e['Trade Classification'] || e['Classification'] || '',
        location: e['Location'] || ''
      }));

      return {
        jobNumber: jNum,
        jobName: c['Job Name'] || 'Site Project',
        foreman: c['Foreman / Lead'] || c['Lead'] || c['Foreman'] || 'Unassigned',
        location: c['Location'] || 'Helena',
        status: c['Status'] || 'Active',
        schedule: c['Work Schedule'] || 'Mon-Thu',
        skipDays: c['Skip Days'] || 'Sun, Fri, Sat',
        workerCount: members.length,
        roster: members
      };
    });

    return {
      activeCrewsCount: detailedCrews.length,
      crews: detailedCrews
    };
  }

  toolGetSafetyCompliance(args) {
    const scTable = this.db.getTable('safety_compliance');
    const rows = scTable.rows || [];

    if (rows.length === 0) {
      return { message: 'No safety compliance rows currently recorded in local database.' };
    }

    const crewFilter = (args.crew_name || '').toLowerCase().trim();
    const filtered = crewFilter ? rows.filter(r => String(r['Crew'] || r['Foreman'] || '').toLowerCase().includes(crewFilter)) : rows;

    return {
      totalRecords: filtered.length,
      sampleRecords: filtered.slice(0, 15)
    };
  }

  toolFilterTable(args) {
    if (!window.sheetNavigator) {
      return { success: false, message: 'Sheet navigator is not ready.' };
    }

    if (args.sheet_key) {
      window.sheetNavigator.currentSheetKey = args.sheet_key;
    }

    if (args.search_text !== undefined) {
      window.sheetNavigator.searchTerm = String(args.search_text).toLowerCase().trim();
      const sInput = document.getElementById('sheet-search-input');
      if (sInput) sInput.value = args.search_text;
    }

    if (args.size) window.sheetNavigator.setSizeFilter(args.size);
    if (args.class_rating) window.sheetNavigator.setClassFilter(args.class_rating);
    if (args.location) window.sheetNavigator.setLocationFilter(args.location);
    if (args.status) window.sheetNavigator.setStatusFilter(args.status);

    if (typeof window.navigateToView === 'function') {
      window.navigateToView('sheets-view');
    }

    window.sheetNavigator.renderTabsBar();
    window.sheetNavigator.renderCurrentSheet();

    return {
      success: true,
      message: `Table view updated to "${window.sheetNavigator.currentSheetKey}" with applied filters.`,
      activeFilters: {
        sheet: window.sheetNavigator.currentSheetKey,
        search: window.sheetNavigator.searchTerm,
        size: window.sheetNavigator.filterSize,
        class: window.sheetNavigator.filterClass,
        location: window.sheetNavigator.filterLocation,
        status: window.sheetNavigator.filterStatus
      }
    };
  }

  toolNavigateTo(args) {
    const viewId = args.view_id;
    if (typeof window.navigateToView === 'function') {
      window.navigateToView(viewId);
      if (viewId === 'sheets-view' && args.sheet_tab && window.sheetNavigator) {
        window.sheetNavigator.currentSheetKey = args.sheet_tab;
        window.sheetNavigator.renderTabsBar();
        window.sheetNavigator.renderCurrentSheet();
      }
      return { success: true, message: `Navigated to ${viewId}${args.sheet_tab ? ` (${args.sheet_tab})` : ''}.` };
    }
    return { success: false, message: 'Navigation function not found.' };
  }

  toolOpenEmployeeProfile(args) {
    const name = args.employee_name;
    const tab = args.tab || 'equipment';
    if (window.employeeProfileEngine && typeof window.employeeProfileEngine.openProfileModal === 'function') {
      window.employeeProfileEngine.openProfileModal(name, tab);
      return { success: true, message: `Opened Profile Dossier modal for ${name} on tab "${tab}".` };
    }
    return { success: false, message: 'Employee Profile modal engine not initialized.' };
  }

  toolGetSystemStatus() {
    const snapshot = this.db.snapshot;
    const outbox = this.db.getOutbox() || [];
    const empTable = this.db.getTable('employees');
    const glovesTable = this.db.getTable('gloves');
    const sleevesTable = this.db.getTable('sleeves');

    return {
      status: 'Online / Local IndexedDB Active',
      pendingSyncMutations: outbox.length,
      snapshotExportedAt: snapshot ? snapshot.exportedAt : 'Unknown',
      activeEmployeesCount: (empTable.rows || []).length,
      totalGlovesCount: (glovesTable.rows || []).length,
      totalSleevesCount: (sleevesTable.rows || []).length,
      copilotProvider: this.provider,
      copilotModel: this.model
    };
  }

  parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const parts = s.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d, 12, 0, 0);
      return isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // =========================================================================
  // Send Message & AI Execution (Native Gemini & OpenAI Support)
  // =========================================================================
  async sendMessage(userInput) {
    const text = String(userInput || '').trim();
    if (!text || this.isProcessing) return;

    const activeKey = this.getActiveApiKey();
    if (!activeKey) {
      this.openSettingsModal();
      return;
    }

    const inputEl = document.getElementById('ai-copilot-input');
    if (inputEl) inputEl.value = '';

    this.messages.push({
      role: 'user',
      content: text
    });
    this.renderMessages();
    this.scrollToBottom();

    this.isProcessing = true;
    this.renderTypingIndicator(true, 'Thinking...');

    try {
      if (this.provider === 'google') {
        await this.executeGoogleGeminiLoop(activeKey);
      } else {
        await this.executeOpenAILoop(activeKey);
      }

      try {
        sessionStorage.setItem('sa_copilot_session_history', JSON.stringify(this.messages.slice(-20)));
      } catch { /* ignore */ }

    } catch (err) {
      console.error('AI Copilot error:', err);
      const pLabel = this.provider === 'google' ? 'Google Gemini' : 'OpenAI';
      this.messages.push({
        role: 'assistant',
        content: `⚠️ **Error communicating with ${pLabel}:** ${err.message}\n\n*Check your API key in Copilot Settings (⚙️) or verify your key at ${this.provider === 'google' ? 'aistudio.google.com' : 'platform.openai.com'}.*`
      });
    } finally {
      this.isProcessing = false;
      this.renderTypingIndicator(false);
      this.renderMessages();
      this.scrollToBottom();
    }
  }

  // --- Native Google Gemini Loop ---
  async executeGoogleGeminiLoop(apiKey) {
    let turns = 0;
    const maxTurns = 6;

    const systemText = `You are Safety Assistant Copilot, an expert AI partner inside the Safety Assistant Desktop App for electrical utility PPE and crew safety compliance.
You have real-time programmatic tools to query local inventory (Gloves, Sleeves, Blankets, MACKs, HV Testers, Phasing Sets, AED, Grounds, Hot Sticks), look up employees, inspect safety compliance, and control the app screen.

GUIDELINES:
1. Always be professional, direct, accurate, and concise. Highlight critical safety items (e.g. overdue equipment, missing safety meetings).
2. Use appropriate emojis for clarity (🧤 Gloves, 🦺 Sleeves, 🧱 Blankets, ⚡ High Voltage, ⚠️ Warning/Overdue, ✅ Good/Complete, 📅 Schedule).
3. Format output with clean Markdown tables, bold text, and bullet points for readability.
4. When asked about an employee or specific items, ALWAYS call the corresponding tool (e.g. lookup_employee, search_inventory, get_due_swaps) to get the ground-truth data from the local database before responding.
5. If the user asks to filter, navigate, or view something on screen, execute the navigation or filter tool so their screen updates automatically!
6. Keep responses focused on what the user asked without unnecessary boilerplate.`;

    const systemInstruction = {
      parts: [{ text: systemText }]
    };

    const tools = [
      {
        functionDeclarations: this.getToolsDefinition().map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: this.convertSchemaForGemini(t.function.parameters)
        }))
      }
    ];

    while (turns < maxTurns) {
      turns++;

      // Construct Gemini contents array
      const contents = [];
      this.messages.forEach(msg => {
        if (msg.role === 'system') return;
        if (msg.role === 'user') {
          contents.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
        } else if (msg.role === 'assistant') {
          const parts = [];
          if (msg.content) parts.push({ text: msg.content });
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            msg.tool_calls.forEach(tc => {
              let args = {};
              try { args = JSON.parse(tc.function.arguments); } catch {}
              parts.push({
                functionCall: {
                  name: tc.function.name,
                  args: args
                }
              });
            });
          }
          if (parts.length > 0) {
            contents.push({ role: 'model', parts });
          }
        } else if (msg.role === 'tool') {
          let resultObj = {};
          try { resultObj = JSON.parse(msg.content); } catch { resultObj = { result: msg.content }; }
          contents.push({
            role: 'function',
            parts: [{
              functionResponse: {
                name: msg.name || 'tool_response',
                response: { output: resultObj }
              }
            }]
          });
        }
      });

      let headers = { 'Content-Type': 'application/json' };
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      if (apiKey.startsWith('AQ.')) {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      let response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          systemInstruction,
          contents,
          tools,
          generationConfig: { temperature: 0.2 }
        })
      });

      if (response.status === 401 && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
        response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            systemInstruction,
            contents,
            tools,
            generationConfig: { temperature: 0.2 }
          })
        });
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || `Google API returned error code ${response.status}`);
      }

      const candidate = data.candidates && data.candidates[0];
      if (!candidate) throw new Error('No candidate content received from Google Gemini.');

      const parts = candidate.content?.parts || [];
      const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
      const functionCallParts = parts.filter(p => p.functionCall);

      if (functionCallParts.length > 0) {
        const toolCalls = functionCallParts.map((fcp, i) => ({
          id: `call_${Date.now()}_${i}`,
          function: {
            name: fcp.functionCall.name,
            arguments: JSON.stringify(fcp.functionCall.args || {})
          }
        }));

        this.messages.push({
          role: 'assistant',
          content: textParts,
          tool_calls: toolCalls
        });

        for (const tc of toolCalls) {
          this.renderTypingIndicator(true, `Querying ${tc.function.name.replace(/_/g, ' ')}...`);
          const result = await this.executeToolCall(tc);
          this.messages.push({
            role: 'tool',
            name: tc.function.name,
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          });
        }
      } else {
        this.messages.push({
          role: 'assistant',
          content: textParts
        });
        break;
      }
    }
  }

  // --- OpenAI Loop ---
  async executeOpenAILoop(apiKey) {
    let turns = 0;
    const maxTurns = 6;

    while (turns < maxTurns) {
      turns++;

      const payloadMessages = [
        {
          role: 'system',
          content: `You are Safety Assistant Copilot, an expert AI partner inside the Safety Assistant Desktop App for electrical utility PPE and crew safety compliance.
You have real-time programmatic tools to query local inventory (Gloves, Sleeves, Blankets, MACKs, HV Testers, Phasing Sets, AED, Grounds, Hot Sticks), look up employees, inspect safety compliance, and control the app screen.

GUIDELINES:
1. Always be professional, direct, accurate, and concise. Highlight critical safety items (e.g. overdue equipment, missing safety meetings).
2. Use appropriate emojis for clarity (🧤 Gloves, 🦺 Sleeves, 🧱 Blankets, ⚡ High Voltage, ⚠️ Warning/Overdue, ✅ Good/Complete, 📅 Schedule).
3. Format output with clean Markdown tables, bold text, and bullet points for readability.
4. When asked about an employee or specific items, ALWAYS call the corresponding tool (e.g. lookup_employee, search_inventory, get_due_swaps) to get the ground-truth data from the local database before responding.
5. If the user asks to filter, navigate, or view something on screen, execute the navigation or filter tool so their screen updates automatically!
6. Keep responses focused on what the user asked without unnecessary boilerplate.`
        },
        ...this.messages
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: payloadMessages,
          tools: this.getToolsDefinition(),
          tool_choice: 'auto',
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        let errMsg = `OpenAI API returned error code ${response.status}`;
        if (errData && errData.error && errData.error.message) {
          errMsg = errData.error.message;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const choice = data.choices && data.choices[0];
      if (!choice) throw new Error('No response choices received from OpenAI.');

      const message = choice.message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        this.messages.push(message);

        for (const tc of message.tool_calls) {
          const toolName = tc.function.name;
          this.renderTypingIndicator(true, `Querying ${toolName.replace(/_/g, ' ')}...`);

          const result = await this.executeToolCall(tc);

          this.messages.push({
            role: 'tool',
            name: tc.function.name,
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          });
        }
      } else {
        this.messages.push(message);
        break;
      }
    }
  }

  // =========================================================================
  // UI Rendering & Markdown Parsing
  // =========================================================================
  renderDrawer() {
    let backdrop = document.getElementById('ai-copilot-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'ai-copilot-backdrop';
      backdrop.className = 'ai-copilot-backdrop';
      backdrop.onclick = () => this.closeDrawer();
      document.body.appendChild(backdrop);
    }

    let drawer = document.getElementById('ai-copilot-drawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'ai-copilot-drawer';
      drawer.className = 'ai-copilot-drawer';
      document.body.appendChild(drawer);
    }

    drawer.innerHTML = `
      <div class="ai-copilot-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="ai-copilot-logo">✨</div>
          <div>
            <div style="font-weight: 800; font-size: 14px; color: #fff; display: flex; align-items: center; gap: 6px;">
              Safety Assistant Copilot
            </div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 1px;">
              <span class="ai-model-badge" id="ai-copilot-model-badge" onclick="window.aiCopilotEngine.openSettingsModal()" title="Click to change AI provider, model, or key">
                ${this.provider === 'google' ? '🔵 Google' : '🟢 OpenAI'} • ${this.model}
              </span>
              <span style="font-size: 10px; color: #94a3b8;">• Online Local Link</span>
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="ai-header-btn" onclick="window.aiCopilotEngine.openSettingsModal()" title="Copilot Settings & API Key">
            ⚙️
          </button>
          <button class="ai-header-btn" onclick="window.aiCopilotEngine.clearChat()" title="Clear Chat History">
            🗑️
          </button>
          <button class="ai-header-btn" onclick="window.aiCopilotEngine.closeDrawer()" title="Close Copilot (Esc)">
            ✕
          </button>
        </div>
      </div>

      <div class="ai-copilot-messages" id="ai-copilot-messages">
        <!-- Rendered messages -->
      </div>

      <div class="ai-copilot-typing" id="ai-copilot-typing" style="display: none;">
        <span class="ai-typing-dot"></span>
        <span class="ai-typing-dot"></span>
        <span class="ai-typing-dot"></span>
        <span id="ai-typing-status" style="font-size: 11px; color: #94a3b8; margin-left: 6px;">Thinking...</span>
      </div>

      <div class="ai-copilot-footer">
        <div class="ai-input-wrap">
          <textarea
            id="ai-copilot-input"
            class="ai-copilot-textarea"
            placeholder="Ask Copilot or tell it what to do... (Press Enter to send)"
            rows="1"
          ></textarea>

          <div style="display: flex; align-items: center; gap: 4px;">
            <button
              id="ai-copilot-mic-btn"
              class="ai-action-btn"
              onclick="window.aiCopilotEngine.toggleVoiceInput()"
              title="Speak prompt (Speech to Text)"
            >
              🎙️
            </button>
            <button
              id="ai-copilot-send-btn"
              class="ai-send-btn"
              onclick="window.aiCopilotEngine.handleSendFromInput()"
              title="Send message"
            >
              ➤
            </button>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; margin-top: 6px; padding: 0 4px;">
          <span>Safety Assistant AI • Function Calling Enabled</span>
          <span style="cursor: pointer; text-decoration: underline;" onclick="window.aiCopilotEngine.openSettingsModal()">Config</span>
        </div>
      </div>
    `;

    this.renderSettingsModal();
    this.renderMessages();
  }

  renderSettingsModal() {
    let modal = document.getElementById('ai-copilot-settings-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ai-copilot-settings-modal';
      modal.className = 'modal-overlay';
      modal.style.zIndex = '120000';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 540px; width: 92vw; background: #0f172a; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); overflow: hidden;">
        <div class="modal-header" style="background: linear-gradient(135deg, rgba(147, 51, 234, 0.25) 0%, rgba(30, 41, 59, 0.8) 100%); padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 800; font-size: 15px; color: #fff; display: flex; align-items: center; gap: 8px;">
            <span>✨</span> AI Copilot Settings & Model
          </div>
          <button class="btn-close" onclick="window.aiCopilotEngine.closeSettingsModal()" style="background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 20px;">
          <!-- Provider Selector Tabs -->
          <div style="margin-bottom: 18px;">
            <label style="display: block; font-size: 12px; font-weight: 700; color: #e2e8f0; margin-bottom: 8px;">
              Select AI Engine / Provider
            </label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button
                type="button"
                id="ai-provider-btn-google"
                class="ai-provider-tab ${this.provider === 'google' ? 'active' : ''}"
                data-provider="google"
                onclick="window.aiCopilotEngine.setSettingsProvider('google')"
                style="padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.3); background: rgba(30, 41, 59, 0.6); color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; justify-content: center; transition: all 0.15s ease;"
              >
                <span>🔵</span> Google Gemini (Free)
              </button>
              <button
                type="button"
                id="ai-provider-btn-openai"
                class="ai-provider-tab ${this.provider === 'openai' ? 'active' : ''}"
                data-provider="openai"
                onclick="window.aiCopilotEngine.setSettingsProvider('openai')"
                style="padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.3); background: rgba(30, 41, 59, 0.6); color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; justify-content: center; transition: all 0.15s ease;"
              >
                <span>🟢</span> OpenAI (ChatGPT)
              </button>
            </div>
          </div>

          <!-- API Key Input -->
          <div style="margin-bottom: 16px;">
            <label id="ai-copilot-key-label" style="display: block; font-size: 12px; font-weight: 700; color: #e2e8f0; margin-bottom: 6px;">
              Google Gemini API Key <span style="color: #34d399; font-size: 11px; font-weight: normal; margin-left: 6px;">(100% Free Tier Available)</span>
            </label>
            <div style="display: flex; gap: 6px;">
              <input
                type="password"
                id="ai-copilot-api-key-input"
                class="form-control"
                placeholder="AIzaSy... (Paste Google AI Studio Key)"
                style="flex: 1; padding: 9px 12px; font-size: 13px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #fff; outline: none; font-family: monospace;"
              />
              <button
                type="button"
                id="ai-copilot-eye-btn"
                class="btn btn-secondary"
                onclick="window.aiCopilotEngine.toggleKeyVisibility()"
                style="padding: 8px 12px; font-size: 14px;"
                title="Show / Hide Key"
              >
                👁️
              </button>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
              <span style="font-size: 11px; color: #94a3b8;">Stored only in your offline local app storage.</span>
              <a id="ai-copilot-key-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #34d399; text-decoration: none; font-weight: 600;">
                Get Free Google Key (1-Click) ↗
              </a>
            </div>
          </div>

          <!-- Model Dropdown -->
          <div style="margin-bottom: 18px;">
            <label style="display: block; font-size: 12px; font-weight: 700; color: #e2e8f0; margin-bottom: 6px;">
              AI Model
            </label>
            <select
              id="ai-copilot-model-select"
              class="form-control"
              title="Select AI Model"
              aria-label="Select AI Model"
              style="width: 100%; padding: 9px 12px; font-size: 13px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #fff; outline: none; cursor: pointer;"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Latest Workhorse, High Intelligence & 100% Free — Recommended)</option>
              <option value="gemini-3.8-flash-lite">gemini-3.8-flash-lite (Ultralight, High Throughput, 100% Free)</option>
              <option value="gemini-3.7-flash">gemini-3.7-flash (Multi-step Reasoning & Coding, 100% Free)</option>
            </select>
          </div>

          <div id="ai-copilot-settings-status" style="font-size: 12px; font-weight: 600; margin-bottom: 14px; display: none;"></div>

          <div id="ai-copilot-provider-info" style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px; margin-bottom: 18px;">
            <div style="font-size: 11.5px; font-weight: 700; color: #34d399; margin-bottom: 4px;">🎉 Google AI Studio Free Tier:</div>
            <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.5;">
              Google offers <strong>15 requests per minute and 1 million tokens per minute completely free</strong> for personal & team development. No credit card required.
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn btn-secondary" onclick="window.aiCopilotEngine.closeSettingsModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="window.aiCopilotEngine.handleSaveSettings()" style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border: none; font-weight: 700;">
              💾 Test & Save Key
            </button>
          </div>
        </div>
      </div>
    `;

    this.renderSettingsModalContent(this.provider);
  }

  setupListeners() {
    const input = document.getElementById('ai-copilot-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendFromInput();
        }
      });

      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          this.toggleDrawer();
        }
      }
      if (e.key === 'Escape' && this.isOpen) {
        this.closeDrawer();
      }
    });
  }

  handleSendFromInput() {
    const input = document.getElementById('ai-copilot-input');
    if (!input) return;
    const text = input.value;
    input.style.height = 'auto';
    this.sendMessage(text);
  }

  renderTypingIndicator(show, statusText = 'Thinking...') {
    const typingEl = document.getElementById('ai-copilot-typing');
    const statusEl = document.getElementById('ai-typing-status');
    if (typingEl) {
      typingEl.style.display = show ? 'flex' : 'none';
      if (statusEl && statusText) statusEl.textContent = statusText;
    }
  }

  renderMessages() {
    const container = document.getElementById('ai-copilot-messages');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = `
        <div class="ai-welcome-card">
          <div style="font-size: 28px; margin-bottom: 8px;">✨</div>
          <h3 style="font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 6px;">Safety Assistant Copilot</h3>
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px;">
            Ask questions about PPE inventory, look up line workers, check safety compliance, or let Copilot filter tables and navigate the app for you.
          </p>

          <div class="ai-suggestions-title">TRY ASKING:</div>
          <div class="ai-suggestions-grid">
            <button class="ai-chip" onclick="window.aiCopilotEngine.sendMessage('Look up Chris Sugrue and show assigned equipment')">
              🔍 Look up Chris Sugrue
            </button>
            <button class="ai-chip" onclick="window.aiCopilotEngine.sendMessage('What gloves or sleeves in Bozeman are overdue or due for swap soon?')">
              ⚠️ Overdue Bozeman swaps
            </button>
            <button class="ai-chip" onclick="window.aiCopilotEngine.sendMessage('Filter inventory to Class 2, Size 10 gloves in Helena')">
              🧤 Filter Class 2, Size 10 gloves
            </button>
            <button class="ai-chip" onclick="window.aiCopilotEngine.sendMessage('Give me an overview of active crews and their foremen')">
              👷 Active crews & foremen
            </button>
            <button class="ai-chip" onclick="window.aiCopilotEngine.sendMessage('Check safety compliance for all active crews')">
              🛡️ Check safety compliance
            </button>
            <button class="ai-chip" onclick="window.aiCopilotEngine.sendMessage('What is the current system database sync status?')">
              📊 System sync status
            </button>
          </div>
        </div>
      `;
      if (!this.getActiveApiKey()) {
        this.showNoApiKeyNotice();
      }
      return;
    }

    let html = '';
    this.messages.forEach((msg) => {
      if (msg.role === 'system') return;
      if (msg.role === 'tool') return;

      const isUser = msg.role === 'user';
      const content = msg.content || '';

      if (isUser) {
        html += `
          <div class="ai-msg-row user">
            <div class="ai-bubble user">
              ${this.escapeHtml(content)}
            </div>
          </div>
        `;
      } else {
        let toolPills = '';
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          toolPills = msg.tool_calls.map(tc => {
            const name = tc.function.name.replace(/_/g, ' ');
            return `<div class="ai-tool-pill"><span>⚙️</span> Used ${this.escapeHtml(name)}</div>`;
          }).join('');
        }

        const formattedBody = this.formatMarkdown(content);

        html += `
          <div class="ai-msg-row assistant">
            <div class="ai-avatar">✨</div>
            <div class="ai-bubble assistant">
              ${toolPills}
              ${formattedBody || (toolPills ? '<span style="font-size: 11.5px; color: #94a3b8;">Data retrieved. Formulating response...</span>' : '')}
            </div>
          </div>
        `;
      }
    });

    container.innerHTML = html;
  }

  scrollToBottom() {
    const container = document.getElementById('ai-copilot-messages');
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }

  formatMarkdown(raw) {
    if (!raw) return '';

    let text = this.escapeHtml(raw);

    text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
      return `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`;
    });

    text = text.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/^### (.*$)/gim, '<div class="ai-md-h3">$1</div>');
    text = text.replace(/^## (.*$)/gim, '<div class="ai-md-h2">$1</div>');
    text = text.replace(/^# (.*$)/gim, '<div class="ai-md-h1">$1</div>');

    text = text.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (tableText) => {
      const rows = tableText.trim().split(/\r?\n/).map(r => r.trim()).filter(Boolean);
      if (rows.length < 2) return tableText;

      let tableHtml = '<div class="ai-table-wrap"><table class="ai-md-table">';
      rows.forEach((row, rIdx) => {
        if (row.match(/^\|(?:\s*:?-+:?\s*\|)+$/)) return;

        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        tableHtml += '<tr>';
        cells.forEach(cell => {
          if (rIdx === 0) {
            tableHtml += `<th>${cell}</th>`;
          } else {
            tableHtml += `<td>${cell}</td>`;
          }
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</table></div>';
      return tableHtml;
    });

    text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<div class="ai-bullet">• $1</div>');
    text = text.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<div class="ai-num-item"><strong>$1.</strong> $2</div>');
    text = text.replace(/\n\n+/g, '<div class="ai-gap"></div>');
    text = text.replace(/\n/g, '<br/>');

    return text;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global initialization
window.aiCopilotEngine = new AICopilotEngine(window.localDB);
