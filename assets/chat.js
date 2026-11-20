(function () {
  'use strict';

  const MAX_INPUT_CHARS = 1000;
  const MAX_HISTORY_MESSAGES = 10;
  const MAX_HISTORY_CHARS = 1200;

  const COPY = {
    en: {
      heading: 'Ask me anything',
      intro: 'Have a question about my mining IT background, Power BI dashboards, PMP® projects, or availability? Ask my assistant below.',
      greeting: "Hi, I'm Timothy's assistant. Ask me anything about my experience, projects, certifications, or how we can work together.",
      placeholder: 'Ask about my experience, projects, or certifications…',
      send: 'Send question',
      micStart: 'Speak your question',
      micStop: 'Stop listening',
      startOver: 'Start over',
      errorSuffix: (email) => `Sorry, I couldn't finish that answer. You can reach me at [${email}](mailto:${email}).`,
    },
    fr: {
      heading: 'Posez-moi vos questions',
      intro: 'Une question sur mon parcours IT minier, mes tableaux de bord Power BI, mes projets PMP® ou ma disponibilité ? Demandez à mon assistant ci-dessous.',
      greeting: "Bonjour, je suis l'assistant de Timothée. Posez-moi vos questions sur mon expérience, mes projets, mes certifications ou une collaboration.",
      placeholder: 'Posez une question sur mon expérience, mes projets ou mes certifications…',
      send: 'Envoyer la question',
      micStart: 'Dicter votre question',
      micStop: "Arrêter l'écoute",
      startOver: 'Recommencer',
      errorSuffix: (email) => `Désolé, je n'ai pas pu terminer cette réponse. Vous pouvez me contacter à [${email}](mailto:${email}).`,
    },
  };

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function svgEl(tag, attrs, ...children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v != null) node.setAttribute(k, String(v));
      }
    }
    for (const child of children.flat()) {
      if (child) node.appendChild(child);
    }
    return node;
  }

  /**
   * Protocol whitelist: only https://, http://, mailto:, and same-site relative/hash links.
   * Anything else (e.g. javascript:, data:) is rejected and shown as plain text.
   */
  function safeHref(raw) {
    const href = String(raw || '').trim();
    if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(href)) return href;
    if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
    if (/^(\/(?!\/)|#)[^\s]*$/.test(href)) return href;
    return null;
  }

  function createSafeLink(href, label) {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    a.textContent = label;

    const isExternal = /^https?:/i.test(href);
    if (isExternal) {
      // If it points to a #project-... hash on the current site, open the modal directly
      try {
        const parsed = new URL(href);
        if (parsed.origin === window.location.origin && parsed.hash.startsWith('#project-')) {
          a.addEventListener('click', (ev) => {
            if (window.__PORTFOLIO__?.openProjectByHash?.(parsed.hash)) {
              ev.preventDefault();
            }
          });
          return a;
        }
      } catch (_) {}
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    } else if (href.includes('#project-')) {
      const hashIdx = href.indexOf('#project-');
      const hash = href.slice(hashIdx);
      a.addEventListener('click', (ev) => {
        if (window.__PORTFOLIO__?.openProjectByHash?.(hash)) {
          ev.preventDefault();
        }
      });
    }
    return a;
  }

  const INLINE_TOKEN =
    /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()\]]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|\*\*([^*\n]+)\*\*/g;

  function appendInlineNodes(parent, text) {
    let last = 0;
    for (const match of text.matchAll(INLINE_TOKEN)) {
      const start = match.index ?? 0;
      if (start > last) {
        parent.appendChild(document.createTextNode(text.slice(last, start)));
      }
      const [whole, label, mdHref, bareUrl, email, bold] = match;
      if (label && mdHref) {
        const href = safeHref(mdHref);
        parent.appendChild(href ? createSafeLink(href, label) : document.createTextNode(label));
      } else if (bareUrl) {
        const trimmed = bareUrl.replace(/[.,;:!?]+$/, '');
        const href = safeHref(trimmed);
        parent.appendChild(
          href
            ? createSafeLink(href, trimmed.replace(/^https?:\/\/(www\.)?/i, ''))
            : document.createTextNode(trimmed),
        );
        if (trimmed.length < bareUrl.length) {
          parent.appendChild(document.createTextNode(bareUrl.slice(trimmed.length)));
        }
      } else if (email) {
        parent.appendChild(createSafeLink(`mailto:${email}`, email));
      } else if (bold) {
        parent.appendChild(el('strong', { text: bold }));
      } else {
        parent.appendChild(document.createTextNode(whole));
      }
      last = start + whole.length;
    }
    if (last < text.length) {
      parent.appendChild(document.createTextNode(text.slice(last)));
    }
  }

  /**
   * Render assistant text safely into DOM nodes (paragraphs, bullet lists,
   * Markdown links, bare URLs, bare emails, bold) with zero innerHTML.
   */
  function renderRichText(container, text) {
    container.textContent = '';
    const trimmed = String(text || '').trim();
    if (!trimmed) return;

    const blocks = trimmed.split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const ul = document.createElement('ul');
        for (const line of lines) {
          const li = document.createElement('li');
          appendInlineNodes(li, line.replace(/^\s*[-*]\s+/, ''));
          ul.appendChild(li);
        }
        container.appendChild(ul);
      } else {
        const p = document.createElement('p');
        lines.forEach((line, idx) => {
          if (idx > 0) p.appendChild(document.createElement('br'));
          appendInlineNodes(p, line);
        });
        container.appendChild(p);
      }
    }
  }

  function initChat(lang, content) {
    const section = document.getElementById('assistant');
    if (!section) return;

    const t = COPY[lang === 'fr' ? 'fr' : 'en'];
    const email = content?.profile?.email || 'timothekabwe@gmail.com';
    const suggestions = Array.isArray(content?.suggestedQuestions) ? content.suggestedQuestions : [];

    section.textContent = '';

    const intro = el('div', { class: 'ask-intro' },
      el('h2', { id: 'chat-heading', text: t.heading }),
      el('p', { text: t.intro }),
    );

    const logEl = el('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
    const resetBtn = el('button', { type: 'button', class: 'chat-reset', text: t.startOver, hidden: true });

    const inputEl = el('textarea', {
      id: 'chat-input',
      rows: '1',
      maxlength: String(MAX_INPUT_CHARS),
      placeholder: t.placeholder,
      'aria-label': t.placeholder,
    });

    const sendBtn = el('button', {
      type: 'submit',
      class: 'icon-btn send',
      'aria-label': t.send,
      disabled: true,
    }, svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      svgEl('path', { d: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' }),
    ));

    // Voice input (Web Speech API) — only rendered if browser supports it
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let micBtn = null;
    let recognition = null;
    let listening = false;

    if (SpeechRec) {
      micBtn = el('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': t.micStart,
        'aria-pressed': 'false',
      }, svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        svgEl('path', { d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' }),
        svgEl('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8' }),
      ));
    }

    const formEl = el('form', { class: 'chat-form' }, inputEl, micBtn, sendBtn);
    const chatBox = el('div', { class: 'chat' }, resetBtn, logEl, formEl);
    section.append(intro, chatBox);

    let history = [];
    let busy = false;
    let abortController = null;

    function updateSendState() {
      sendBtn.disabled = busy || !inputEl.value.trim();
    }

    function autoGrow() {
      inputEl.style.height = 'auto';
      inputEl.style.height = `${Math.min(inputEl.scrollHeight, 128)}px`;
    }

    function renderEmptyState() {
      logEl.textContent = '';
      const empty = el('div', { class: 'chat-empty' }, el('p', { text: t.greeting }));
      if (suggestions.length) {
        const list = el('ul', { class: 'chat-suggestions' });
        for (const q of suggestions.slice(0, 5)) {
          const btn = el('button', { type: 'button', text: q });
          btn.addEventListener('click', () => sendQuestion(q));
          list.appendChild(el('li', null, btn));
        }
        empty.appendChild(list);
      }
      logEl.appendChild(empty);
      resetBtn.hidden = true;
    }

    function scrollToBottom() {
      logEl.scrollTop = logEl.scrollHeight;
    }

    function stopListening() {
      if (recognition && listening) {
        try {
          recognition.stop();
        } catch (_) {}
      }
      listening = false;
      if (micBtn) {
        micBtn.classList.remove('is-on');
        micBtn.setAttribute('aria-pressed', 'false');
        micBtn.setAttribute('aria-label', t.micStart);
      }
    }

    if (micBtn && SpeechRec) {
      micBtn.addEventListener('click', () => {
        if (listening) {
          stopListening();
          return;
        }
        try {
          recognition = new SpeechRec();
          recognition.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
          recognition.interimResults = true;
          recognition.continuous = false;

          listening = true;
          micBtn.classList.add('is-on');
          micBtn.setAttribute('aria-pressed', 'true');
          micBtn.setAttribute('aria-label', t.micStop);

          let finalTranscript = '';
          recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0]?.transcript || '';
              if (event.results[i].isFinal) finalTranscript += transcript;
              else interim += transcript;
            }
            inputEl.value = (finalTranscript + interim).slice(0, MAX_INPUT_CHARS);
            autoGrow();
            updateSendState();
          };
          recognition.onerror = () => stopListening();
          recognition.onend = () => {
            stopListening();
            inputEl.focus();
          };
          recognition.start();
        } catch (_) {
          stopListening();
        }
      });
    }

    async function sendQuestion(rawText) {
      const question = String(rawText || '').trim().slice(0, MAX_INPUT_CHARS);
      if (!question || busy) return;

      stopListening();
      busy = true;

      if (history.length === 0) {
        logEl.textContent = '';
      }
      resetBtn.hidden = false;

      history.push({ role: 'user', content: question });
      logEl.appendChild(el('div', { class: 'bubble bubble-user', text: question }));

      const assistantBubble = el('div', { class: 'bubble bubble-assistant' },
        el('span', { class: 'typing', 'aria-label': 'Typing' }, el('i'), el('i'), el('i')),
      );
      logEl.appendChild(assistantBubble);
      scrollToBottom();

      inputEl.value = '';
      autoGrow();
      updateSendState();

      const payloadMessages = history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
        role: m.role,
        content: String(m.content || '').slice(0, MAX_HISTORY_CHARS),
      }));

      abortController = new AbortController();
      let fullReply = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: payloadMessages, lang }),
          signal: abortController.signal,
        });

        if (!res.body) {
          fullReply = await res.text();
          renderRichText(assistantBubble, fullReply || t.errorSuffix(email));
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) {
              fullReply += chunk;
              renderRichText(assistantBubble, fullReply);
              scrollToBottom();
            }
          }
          const flush = decoder.decode();
          if (flush) {
            fullReply += flush;
            renderRichText(assistantBubble, fullReply);
          }
        }

        if (!fullReply.trim()) {
          fullReply = t.errorSuffix(email);
          renderRichText(assistantBubble, fullReply);
        }
        history.push({ role: 'assistant', content: fullReply });
      } catch (err) {
        if (err?.name !== 'AbortError') {
          const fallback = fullReply.trim()
            ? `${fullReply.trim()}\n\n${t.errorSuffix(email)}`
            : t.errorSuffix(email);
          renderRichText(assistantBubble, fallback);
          history.push({ role: 'assistant', content: fallback });
        }
      } finally {
        busy = false;
        abortController = null;
        updateSendState();
        scrollToBottom();
      }
    }

    resetBtn.addEventListener('click', () => {
      if (abortController) abortController.abort();
      history = [];
      busy = false;
      renderEmptyState();
      updateSendState();
      inputEl.focus();
    });

    inputEl.addEventListener('input', () => {
      autoGrow();
      updateSendState();
    });

    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (inputEl.value.trim() && !busy) {
          sendQuestion(inputEl.value);
        }
      }
    });

    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      sendQuestion(inputEl.value);
    });

    renderEmptyState();
    updateSendState();
  }

  if (window.__PORTFOLIO__ && window.__PORTFOLIO__.content) {
    initChat(window.__PORTFOLIO__.lang, window.__PORTFOLIO__.content);
  } else {
    document.addEventListener('portfolio:ready', (event) => {
      initChat(event.detail.lang, event.detail.content);
    });
  }
})();
