/**
 * Application Entry Point & UI Event Handler
 * Binds DOM elements, state updates, modal management, drag & drop, and PWA installation events.
 */

document.addEventListener('DOMContentLoaded', () => {
  const sound = new SoundSynthesizer();
  let game = null;
  let selectedSwapHandCardId = null;

  // DOM Elements
  const statusBar = document.getElementById('status-bar');
  const playBtn = document.getElementById('play-btn');
  const pickupBtn = document.getElementById('pickup-btn');
  const swapReadyBtn = document.getElementById('swap-ready-btn');

  const drawDeckSlot = document.getElementById('draw-deck-slot');
  const deckCountEl = document.getElementById('deck-count');
  const playPileSlot = document.getElementById('play-pile-slot');
  const playPileStack = document.getElementById('play-pile-stack');
  const pileCountEl = document.getElementById('pile-count');

  // Modals
  const modalRules = document.getElementById('modal-rules');
  const modalSettings = document.getElementById('modal-settings');
  const modalStats = document.getElementById('modal-stats');
  const modalGameOver = document.getElementById('modal-game-over');
  const modalPreGame = document.getElementById('modal-pre-game');
  const modalLeaderboard = document.getElementById('modal-leaderboard');
  const gameOverNewBtn = document.getElementById('game-over-new-btn');
  const gameOverLbBtn = document.getElementById('game-over-lb-btn');
  const gameOverCloseBtn = document.getElementById('game-over-close-btn');
  const preGameStartBtn = document.getElementById('pre-game-start-btn');
  const preGameDiffGrid = document.getElementById('pre-game-difficulty-grid');
  let selectedPreGameDifficulty = 'medium';

  let gameOverModalShownForCurrentGame = false;

  if (gameOverNewBtn) {
    gameOverNewBtn.addEventListener('click', () => {
      closeModal(modalGameOver);
      openPreGameModal();
    });
  }

  if (gameOverLbBtn) {
    gameOverLbBtn.addEventListener('click', () => {
      closeModal(modalGameOver);
      updateProfileUI();
      updateLeaderboardDisplay(currentLeaderboardMode);
      openModal(modalLeaderboard);
    });
  }

  if (gameOverCloseBtn) {
    gameOverCloseBtn.addEventListener('click', () => {
      closeModal(modalGameOver);
    });
  }

  // Modal Triggers
  document.getElementById('rules-btn').addEventListener('click', () => openModal(modalRules));
  document.getElementById('settings-btn').addEventListener('click', () => {
    updateProfileUI();
    openModal(modalSettings);
  });
  document.getElementById('stats-btn').addEventListener('click', () => {
    updateStatsDisplay();
    openModal(modalStats);
  });

  const leaderboardBtn = document.getElementById('leaderboard-btn');
  if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', () => {
      updateProfileUI();
      updateLeaderboardDisplay(currentLeaderboardMode);
      openModal(modalLeaderboard);
    });
  }

  // Google Play Linking Buttons
  const settingsGpBtn = document.getElementById('settings-gp-link-btn');
  if (settingsGpBtn) {
    settingsGpBtn.addEventListener('click', handleGooglePlayToggle);
  }

  const lbGpBtn = document.getElementById('leaderboard-gp-link-btn');
  if (lbGpBtn) {
    lbGpBtn.addEventListener('click', handleGooglePlayToggle);
  }

  // Edit Name Button
  const editNameBtn = document.getElementById('settings-edit-name-btn');
  if (editNameBtn) {
    editNameBtn.addEventListener('click', () => {
      if (typeof profileManager === 'undefined') return;
      const profile = profileManager.getProfile();
      if (profile.isGooglePlayLinked) {
        alert(`Your name is linked to Google Play as "${profile.googlePlayGamerTag}".\nTo use a custom handle, unlink your Google Play account first.`);
        return;
      }
      const newName = prompt('Enter your unique card player handle (max 20 characters):', profileManager.getDisplayName());
      if (newName !== null && newName.trim()) {
        profileManager.setPlayerName(newName.trim());
        updateProfileUI();
        updateLeaderboardDisplay(currentLeaderboardMode);
      }
    });
  }

  // Leaderboard Tabs
  const lbTabScore = document.getElementById('lb-tab-score');
  if (lbTabScore) {
    lbTabScore.addEventListener('click', () => updateLeaderboardDisplay('score'));
  }

  const lbTabElo = document.getElementById('lb-tab-elo');
  if (lbTabElo) {
    lbTabElo.addEventListener('click', () => updateLeaderboardDisplay('elo'));
  }

  const headerEloPill = document.getElementById('header-elo-pill');
  if (headerEloPill) {
    headerEloPill.addEventListener('click', () => {
      updateStatsDisplay();
      openModal(modalStats);
    });
  }

  const resetStatsBtn = document.getElementById('reset-stats-btn');
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', () => {
      if (confirm('Reset your Shithead career statistics? This cannot be undone.')) {
        if (typeof statsManager !== 'undefined') {
          statsManager.resetStats();
        }
        updateStatsDisplay();
      }
    });
  }

  // Pre-populate stats & profile on startup
  updateProfileUI();
  updateStatsDisplay();

  document.getElementById('sound-btn').addEventListener('click', (e) => {
    sound.enabled = !sound.enabled;
    e.target.textContent = sound.enabled ? '🔊' : '🔇';
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay')));
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // Settings Controls
  document.getElementById('setting-sound').addEventListener('change', (e) => {
    sound.enabled = e.target.checked;
    document.getElementById('sound-btn').textContent = sound.enabled ? '🔊' : '🔇';
  });

  document.getElementById('new-game-btn').addEventListener('click', () => {
    if (game && game.gamePhase !== 'ENDED') {
      alert('Please finish your current game before starting a new one!');
      return;
    }
    closeModal(modalSettings);
    openPreGameModal();
  });

  // Action Buttons
  swapReadyBtn.addEventListener('click', () => {
    if (game) game.finishSwapPhase();
  });

  playBtn.addEventListener('click', () => {
    if (game) game.playSelectedCards();
  });

  pickupBtn.addEventListener('click', () => {
    if (game) game.pickupPileHuman();
  });

  // Setup HTML5 Drag & Drop Listeners on Play Pile Slot
  if (playPileSlot) {
    playPileSlot.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      playPileSlot.classList.add('drag-over');
    });

    playPileSlot.addEventListener('dragleave', (e) => {
      if (!playPileSlot.contains(e.relatedTarget)) {
        playPileSlot.classList.remove('drag-over');
      }
    });

    playPileSlot.addEventListener('drop', (e) => {
      e.preventDefault();
      playPileSlot.classList.remove('drag-over');
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          const data = JSON.parse(raw);
          if (data && data.cardId) {
            handleCardDropOnPile(data.cardId, data.source);
          }
        }
      } catch (err) {
        console.warn('Error on play pile drop:', err);
      }
    });
  }

  function updateHeaderElo() {
    try {
      const stats = (typeof statsManager !== 'undefined') ? statsManager.getStats() : { elo: 1200 };
      const eloVal = stats.elo || 1200;
      const tier = (typeof StatsManager !== 'undefined') ? StatsManager.getTier(eloVal) : { name: 'Silver', badge: '🥈', elo: eloVal };
      const hBadge = document.getElementById('header-tier-badge'); if (hBadge) hBadge.textContent = tier.badge;
      const hName = document.getElementById('header-tier-name'); if (hName) hName.textContent = tier.name;
      const hVal = document.getElementById('header-elo-val'); if (hVal) hVal.textContent = tier.elo;
    } catch (e) {}
  }

  function handleScoreEvent({ points, label, icon, totalScore }) {
    const scoreEl = document.getElementById('header-match-score');
    if (scoreEl) scoreEl.textContent = totalScore;
    const scorePill = document.getElementById('header-score-pill');
    if (scorePill) {
      scorePill.classList.remove('score-bump');
      requestAnimationFrame(() => {
        scorePill.classList.add('score-bump');
        setTimeout(() => scorePill.classList.remove('score-bump'), 250);
      });
    }

    const container = document.getElementById('floating-score-container');
    if (!container) return;

    // Throttle to maximum 2 floating toasts to prevent frame drops/flickering on mobile
    while (container.children.length >= 2) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    const isNegative = points < 0;
    toast.className = `floating-score-toast ${isNegative ? 'is-negative' : ''}`;
    toast.innerHTML = `
      <span>${icon}</span>
      <span>${label}</span>
      <span style="color:${isNegative ? 'var(--accent-rose)' : 'var(--accent-gold)'}; margin-left:auto;">${points > 0 ? '+' : ''}${points}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode === container) {
        toast.remove();
      }
    }, 1500);
  }

  function openPreGameModal() {
    if (!modalPreGame) {
      startNewGame(true);
      return;
    }

    const stats = (typeof statsManager !== 'undefined')
      ? statsManager.getStats()
      : { elo: 1200, currentStreak: 0 };
    const tier = (typeof StatsManager !== 'undefined')
      ? StatsManager.getTier(stats.elo)
      : { name: 'Silver', badge: '🥈' };
    const recommendedDiff = (typeof StatsManager !== 'undefined')
      ? StatsManager.getRecommendedDifficulty(stats.elo)
      : 'medium';

    // Default to recommended difficulty or currently selected setting
    const currentSettingDiff = document.getElementById('setting-difficulty')
      ? document.getElementById('setting-difficulty').value
      : 'medium';
    selectedPreGameDifficulty = recommendedDiff || currentSettingDiff || 'medium';

    // Update banner elements
    const rankBadgeEl = document.getElementById('pre-game-rank-badge');
    const tierNameEl = document.getElementById('pre-game-tier-name');
    const eloEl = document.getElementById('pre-game-elo');
    const streakEl = document.getElementById('pre-game-streak');

    if (rankBadgeEl) rankBadgeEl.textContent = tier.badge;
    if (tierNameEl) tierNameEl.textContent = tier.name;
    if (eloEl) eloEl.textContent = stats.elo;
    if (streakEl) streakEl.textContent = stats.currentStreak || 0;

    // Render difficulty cards in grid
    if (preGameDiffGrid && typeof StatsManager !== 'undefined') {
      preGameDiffGrid.innerHTML = '';
      const stakes = StatsManager.DIFFICULTY_STAKES;

      Object.entries(stakes).forEach(([key, conf]) => {
        const isSelected = key === selectedPreGameDifficulty;
        const isRec = key === recommendedDiff;

        const card = document.createElement('div');
        card.className = `diff-card ${isSelected ? 'is-selected' : ''} ${isRec ? 'is-recommended' : ''}`;
        card.setAttribute('data-difficulty', key);

        const winEloVal = Math.abs(conf.winElo || 0);
        const lossEloVal = Math.abs(conf.lossElo || 0);
        const descText = conf.description || conf.desc || '';

        card.innerHTML = `
          ${isRec ? `<div class="diff-rec-banner">⭐ Recommended for Your Rank (${tier.name})</div>` : ''}
          <div class="diff-card-header">
            <span class="diff-card-badge">${conf.badge}</span>
            <span class="diff-card-title">${conf.name} Bot</span>
          </div>
          <div class="diff-stakes-row">
            <div class="diff-stake-win">🏆 1st Place Win: +${winEloVal} Elo (${conf.scoreMultiplier}x Points)</div>
            <div class="diff-stake-loss">💩 Shithead Loss: -${lossEloVal} Elo</div>
          </div>
          <div class="diff-desc">${descText}</div>
        `;

        card.addEventListener('click', () => {
          selectedPreGameDifficulty = key;
          preGameDiffGrid.querySelectorAll('.diff-card').forEach(c => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
        });

        preGameDiffGrid.appendChild(card);
      });
    }

    openModal(modalPreGame);
  }

  if (preGameStartBtn) {
    preGameStartBtn.addEventListener('click', () => {
      if (modalPreGame) closeModal(modalPreGame);
      const diffSelect = document.getElementById('setting-difficulty');
      if (diffSelect) diffSelect.value = selectedPreGameDifficulty;
      startNewGame(true, selectedPreGameDifficulty);
    });
  }

  function startNewGame(forceFresh = false, chosenDifficulty = null) {
    const soundEnabled = document.getElementById('setting-sound').checked;
    const special7 = document.getElementById('setting-7lower').checked;
    const special8 = document.getElementById('setting-8transparent').checked;
    const special4Reverse = document.getElementById('setting-4reverse') ? document.getElementById('setting-4reverse').checked : true;
    const special2PlayAgain = document.getElementById('setting-2playagain') ? document.getElementById('setting-2playagain').checked : true;

    if (chosenDifficulty) {
      const diffSelect = document.getElementById('setting-difficulty');
      if (diffSelect) diffSelect.value = chosenDifficulty;
    }
    const difficulty = chosenDifficulty || document.getElementById('setting-difficulty').value;

    sound.enabled = soundEnabled;

    // Check if there is an active match in progress saved in localStorage
    const savedActiveGame = !forceFresh ? GameEngine.getSavedActiveGame() : null;

    if (savedActiveGame) {
      game = new GameEngine({
        playerCount: savedActiveGame.playerCount || 4,
        aiDifficulty: savedActiveGame.aiDifficulty || difficulty,
        sound: sound,
        ruleSettings: savedActiveGame.ruleSettings || {
          special7Lower: special7,
          special8Transparent: special8,
          special4Reverse: special4Reverse,
          special2PlayAgain: special2PlayAgain
        },
        onScoreEvent: handleScoreEvent,
        onStateChange: renderUI
      });

      const loaded = game.loadSerializedState(savedActiveGame);
      if (loaded) {
        selectedSwapHandCardId = null;
        gameOverModalShownForCurrentGame = false;
        if (modalGameOver) closeModal(modalGameOver);
        if (modalPreGame) closeModal(modalPreGame);

        const scoreEl = document.getElementById('header-match-score');
        if (scoreEl) scoreEl.textContent = game.matchScore || 0;
        updateHeaderElo();

        renderUI(game.getState());

        // If active player is an AI bot and game is in PLAYING phase, resume AI turn
        if (game.gamePhase === 'PLAYING') {
          const curPlayer = game.getCurrentPlayer();
          if (curPlayer && !curPlayer.isHuman && !curPlayer.finished) {
            game.scheduleAITurn();
          }
        }
        return;
      }
    }

    // Otherwise, start a brand new game
    GameEngine.clearSavedActiveGame();

    game = new GameEngine({
      playerCount: 4,
      aiDifficulty: difficulty,
      sound: sound,
      ruleSettings: {
        special7Lower: special7,
        special8Transparent: special8,
        special4Reverse: special4Reverse,
        special2PlayAgain: special2PlayAgain
      },
      onScoreEvent: handleScoreEvent,
      onStateChange: renderUI
    });

    selectedSwapHandCardId = null;
    gameOverModalShownForCurrentGame = false;
    if (modalGameOver) closeModal(modalGameOver);
    if (modalPreGame) closeModal(modalPreGame);

    const scoreEl = document.getElementById('header-match-score');
    if (scoreEl) scoreEl.textContent = '0';
    updateHeaderElo();

    game.initNewGame({ aiDifficulty: difficulty });
  }

  function renderUI(state) {
    if (state.isFastSimulating) {
      statusBar.innerHTML = `<span style="color:var(--accent-gold); font-weight:800; letter-spacing:0.04em;">⚡ FAST-SIMULATING REMAINING PLAYERS...</span>`;
    } else {
      statusBar.textContent = state.statusMessage;
    }

    // Update Header Match Score & Elo
    const headerScoreEl = document.getElementById('header-match-score');
    if (headerScoreEl && typeof state.matchScore === 'number') {
      headerScoreEl.textContent = state.matchScore;
    }
    updateHeaderElo();

    // Guard "Start New Game" button in Settings while match is active
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
      const isGameActive = state.gamePhase !== 'ENDED';
      newGameBtn.disabled = isGameActive;
      newGameBtn.style.opacity = isGameActive ? '0.5' : '1';
      newGameBtn.style.cursor = isGameActive ? 'not-allowed' : 'pointer';
      newGameBtn.textContent = isGameActive ? 'Match in Progress' : 'Start New Game';
      newGameBtn.title = isGameActive ? 'Finish your current game to start a new one' : '';
    }

    // Trigger Game Over Modal when match concludes
    if (state.gamePhase === 'ENDED') {
      showGameOverModal(state);
    }

    // Update Direction Indicator
    const dirIndicator = document.getElementById('direction-indicator');
    if (dirIndicator) {
      const isClockwise = state.playDirection !== -1;
      dirIndicator.classList.toggle('counter-clockwise', !isClockwise);
      const iconEl = dirIndicator.querySelector('.direction-icon');
      const labelEl = dirIndicator.querySelector('.direction-label');
      if (iconEl) iconEl.textContent = isClockwise ? '↻' : '↺';
      if (labelEl) labelEl.textContent = isClockwise ? 'Clockwise' : 'Counter-Clockwise';
    }

    const ruleOpts = state.ruleSettings || {};

    // Render Players
    state.players.forEach((player, idx) => {
      const badge = document.getElementById(`badge-p${idx}`);
      const countPill = document.getElementById(`count-p${idx}`);
      const tableCardsContainer = document.getElementById(`table-cards-p${idx}`);

      if (badge && countPill) {
        if (state.activePlayerIndex === idx && state.gamePhase === 'PLAYING') {
          badge.classList.add('active-turn');
        } else {
          badge.classList.remove('active-turn');
        }

        const totalCount = player.hand.length + player.faceUp.length + player.faceDown.length;
        countPill.textContent = player.finished ? 'FINISHED! 🎉' : `${totalCount} cards`;
      }

      // Render Table Cards (3 stacks of face-down + face-up)
      if (tableCardsContainer) {
        tableCardsContainer.innerHTML = '';
        for (let s = 0; s < 3; s++) {
          const stackEl = document.createElement('div');
          stackEl.className = 'table-card-stack';

          // Drag-over target for swapping cards in SWAP phase
          if (player.isHuman && state.gamePhase === 'SWAP') {
            stackEl.addEventListener('dragover', (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              stackEl.classList.add('drag-over');
            });

            stackEl.addEventListener('dragleave', (e) => {
              if (!stackEl.contains(e.relatedTarget)) {
                stackEl.classList.remove('drag-over');
              }
            });

            stackEl.addEventListener('drop', (e) => {
              e.preventDefault();
              stackEl.classList.remove('drag-over');
              try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data && data.cardId && data.source === 'HAND') {
                  handleCardDropOnTableStack(data.cardId, s);
                }
              } catch (err) {
                console.warn('Error dropping on table stack:', err);
              }
            });
          }

          const fdCard = player.faceDown[s];
          const fuCard = player.faceUp[s];

          if (fdCard) {
            const fdEl = fdCard.renderHTML({ faceUp: false });
            if (player.isHuman && state.gamePhase === 'PLAYING' && game.getPlayerActivePhase(player) === 'FACE_DOWN' && state.activePlayerIndex === 0) {
              fdEl.addEventListener('click', () => { if (!fdEl._justDragged) game.toggleCardSelection(fdCard.id); });
              enableCardDrag(fdEl, fdCard, 'FACE_DOWN', s);
            }
            stackEl.appendChild(fdEl);
          }

          if (fuCard) {
            const isSelected = player.isHuman && state.selectedCardIds.includes(fuCard.id);
            const fuEl = fuCard.renderHTML({
              faceUp: true,
              selected: isSelected,
              special4Reverse: ruleOpts.special4Reverse,
              special2PlayAgain: ruleOpts.special2PlayAgain
            });
            if (isSelected) {
              stackEl.classList.add('selected-stack');
            } else {
              stackEl.classList.remove('selected-stack');
            }
            if (player.isHuman) {
              fuEl.addEventListener('click', () => { if (!fuEl._justDragged) onHumanCardClick('FACE_UP', fuCard.id); });
              enableCardDrag(fuEl, fuCard, 'FACE_UP', s);
            }
            stackEl.appendChild(fuEl);
          }

          if (fdCard || fuCard) {
            tableCardsContainer.appendChild(stackEl);
          }
        }
      }
    });

    // Render Human Hand (P0)
    const humanHandContainer = document.getElementById('hand-cards-p0');
    if (humanHandContainer) {
      humanHandContainer.innerHTML = '';
      const human = state.players[0];
      human.hand.forEach((card, i) => {
        const isSelected = state.selectedCardIds.includes(card.id) || selectedSwapHandCardId === card.id;
        const cardEl = card.renderHTML({
          faceUp: true,
          selected: isSelected,
          special4Reverse: ruleOpts.special4Reverse,
          special2PlayAgain: ruleOpts.special2PlayAgain
        });

        cardEl.style.zIndex = isSelected ? 40 : i + 1;
        cardEl.addEventListener('click', () => { if (!cardEl._justDragged) onHumanCardClick('HAND', card.id); });
        enableCardDrag(cardEl, card, 'HAND');
        humanHandContainer.appendChild(cardEl);
      });
    }

    // Render Center Piles
    deckCountEl.textContent = `${state.deckRemaining} cards`;

    if (playPileStack) {
      playPileStack.innerHTML = '';
      const pile = state.playPile;
      pileCountEl.textContent = `${pile.length} cards`;

      // Check if top card is 8 (Invisible)
      const topCard = pile.length > 0 ? pile[pile.length - 1] : null;
      const isTop8 = topCard && topCard.rank === '8' && ruleOpts.special8Transparent;
      const effectiveTopCard = state.effectiveTopCard;

      // Update Beneath 8 indicator banner
      const effIndicator = document.getElementById('effective-pile-indicator');
      const effPreview = document.getElementById('effective-card-preview');
      if (effIndicator && effPreview) {
        if (isTop8) {
          effIndicator.style.display = 'flex';
          if (effectiveTopCard) {
            const isRed = effectiveTopCard.suit.color === 'red';
            const ruleHint = (ruleOpts.special7Lower && effectiveTopCard.rank === '7') ? '≤ 7' : `≥ ${effectiveTopCard.rank}`;
            effPreview.innerHTML = `
              <span class="eff-card-chip ${isRed ? 'red' : 'black'}">${effectiveTopCard.rank}${effectiveTopCard.suit.symbol}</span>
              <span class="eff-rule-hint">(Play ${ruleHint})</span>
            `;
          } else {
            effPreview.innerHTML = `<span class="eff-card-chip empty">Any Card!</span>`;
          }
        } else {
          effIndicator.style.display = 'none';
        }
      }

      // If top card is 8 and there is an effective top card beneath it, ensure effective top card is included so it peeks out
      let visiblePileCards = pile.slice(-3);
      if (isTop8 && effectiveTopCard && !visiblePileCards.some(c => c.id === effectiveTopCard.id)) {
        visiblePileCards = [effectiveTopCard, ...visiblePileCards.slice(-2)];
      }

      visiblePileCards.forEach((c, idx) => {
        const isThisTop8 = isTop8 && c.rank === '8' && idx === visiblePileCards.length - 1;
        let peekText = '';
        if (isThisTop8) {
          peekText = effectiveTopCard ? `Under: ${effectiveTopCard.rank}${effectiveTopCard.suit.symbol}` : 'Under: Empty';
        }

        const cardEl = c.renderHTML({
          faceUp: true,
          special4Reverse: ruleOpts.special4Reverse,
          special2PlayAgain: ruleOpts.special2PlayAgain,
          peekUnderText: peekText
        });

        cardEl.style.position = 'absolute';
        if (isThisTop8 && effectiveTopCard) {
          cardEl.classList.add('is-ghost-8');
          // Shift 8 card slightly to the bottom-right so the underlying card's top-left corner & rank are clearly visible
          cardEl.style.top = `${idx * 2 + 10}px`;
          cardEl.style.left = `${idx * 2 + 10}px`;
        } else {
          cardEl.style.top = `${idx * 2}px`;
          cardEl.style.left = `${idx * 2}px`;
        }
        playPileStack.appendChild(cardEl);
      });
    }

    // Controls Visibility
    if (state.gamePhase === 'SWAP') {
      swapReadyBtn.style.display = 'flex';
      playBtn.style.display = 'none';
      pickupBtn.style.display = 'none';
    } else {
      swapReadyBtn.style.display = 'none';
      playBtn.style.display = 'flex';
      pickupBtn.style.display = 'flex';

      const isHumanTurn = state.activePlayerIndex === 0;
      const countSelected = state.selectedCardIds.length;
      playBtn.disabled = !isHumanTurn || countSelected === 0;
      pickupBtn.disabled = !isHumanTurn || state.playPile.length === 0;

      if (countSelected > 1) {
        playBtn.textContent = `Play ${countSelected} Selected Cards`;
      } else if (countSelected === 1) {
        playBtn.textContent = `Play Selected Card`;
      } else {
        playBtn.textContent = `Play Selected Cards`;
      }
    }
  }

  function handleCardDropOnPile(cardId, source) {
    if (!game || game.gamePhase !== 'PLAYING' || game.activePlayerIndex !== 0) return;
    const human = game.players[0];
    const activePhase = game.getPlayerActivePhase(human);
    if (source !== activePhase) return;

    const available = game.getAvailableCardsForPlayer(human);
    const droppedCard = available.find(c => c.id === cardId);
    if (!droppedCard) return;

    if (activePhase === 'FACE_DOWN') {
      game.playBlindCard(human, droppedCard);
      return;
    }

    // Determine which cards to play
    let cardsToPlay = [];
    const selectedCards = available.filter(c => game.selectedCardIds.has(c.id));

    if (game.selectedCardIds.has(cardId)) {
      // The dropped card is among selected cards; play all currently selected cards
      cardsToPlay = selectedCards;
    } else if (selectedCards.length > 0 && selectedCards[0].rank === droppedCard.rank) {
      // Same rank as already selected cards; combine them!
      cardsToPlay = [...selectedCards, droppedCard];
    } else {
      // Different rank or nothing selected: play just the dragged card
      cardsToPlay = [droppedCard];
    }

    game.playDirectCards(cardsToPlay);
  }

  function handleCardDropOnTableStack(handCardId, stackIdx) {
    if (!game || game.gamePhase !== 'SWAP') return;
    const human = game.players[0];
    const targetFaceUpCard = human.faceUp[stackIdx];
    if (targetFaceUpCard && handCardId) {
      game.swapCards(handCardId, targetFaceUpCard.id);
      selectedSwapHandCardId = null;
    }
  }

  function clearAllDragOvers() {
    if (playPileSlot) playPileSlot.classList.remove('drag-over');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  function enableCardDrag(cardEl, card, source, stackIdx = null) {
    if (!game) return;
    const human = game.players[0];
    const isHumanTurn = game.activePlayerIndex === 0;
    const activePhase = game.getPlayerActivePhase(human);

    let canDrag = false;
    if (game.gamePhase === 'SWAP') {
      canDrag = (source === 'HAND' || source === 'FACE_UP');
    } else if (game.gamePhase === 'PLAYING' && isHumanTurn) {
      canDrag = (source === activePhase);
    }

    if (!canDrag) return;

    // Prevent default browser drag ghosting
    cardEl.draggable = false;

    let pointerStartX = 0;
    let pointerStartY = 0;
    let isDragging = false;
    let animFrameId = null;

    // Fluid Physics state
    let targetX = 0;
    let targetY = 0;
    let prevTargetX = 0;
    let prevTargetY = 0;
    let currentX = 0;
    let currentY = 0;
    let smoothedVx = 0;
    let smoothedVy = 0;
    let currentTilt = 0;
    let currentPitch = 0;

    let avatarContainer = null;
    let avatarInner = null;
    let sheenEl = null;

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      targetX = e.clientX;
      targetY = e.clientY;
      prevTargetX = e.clientX;
      prevTargetY = e.clientY;
      currentX = e.clientX;
      currentY = e.clientY;
      smoothedVx = 0;
      smoothedVy = 0;
      currentTilt = 0;
      currentPitch = 0;
      isDragging = false;

      const originRect = cardEl.getBoundingClientRect();

      const onPointerMove = (moveEvt) => {
        targetX = moveEvt.clientX;
        targetY = moveEvt.clientY;

        const distMoved = Math.hypot(targetX - pointerStartX, targetY - pointerStartY);

        if (!isDragging && distMoved > 7) {
          isDragging = true;
          try {
            cardEl.setPointerCapture(e.pointerId);
          } catch (err) {}

          // Card in hand becomes soft blurred slot placeholder
          cardEl.classList.add('is-drag-origin');

          // Check if multiple cards of this rank are selected for group play
          let countSelected = 1;
          if (game && game.gamePhase === 'PLAYING' && source === 'HAND') {
            const available = game.getAvailableCardsForPlayer(human);
            const selectedThisRank = available.filter(c => game.selectedCardIds.has(c.id) && c.rank === card.rank);
            if (selectedThisRank.length > 1) {
              countSelected = selectedThisRank.length;
            }
          }

          // Build 2026 Physics Avatar
          avatarContainer = document.createElement('div');
          avatarContainer.className = 'drag-physics-avatar';
          avatarContainer.style.width = `${originRect.width}px`;
          avatarContainer.style.height = `${originRect.height}px`;

          avatarInner = document.createElement('div');
          avatarInner.className = 'drag-avatar-inner';

          // Fanned card underlays if dragging a multi-card set
          if (countSelected > 1) {
            const underlay1 = document.createElement('div');
            underlay1.className = 'drag-stack-underlay under-1';
            avatarInner.appendChild(underlay1);

            if (countSelected > 2) {
              const underlay2 = document.createElement('div');
              underlay2.className = 'drag-stack-underlay under-2';
              avatarInner.appendChild(underlay2);
            }

            const countBadge = document.createElement('div');
            countBadge.className = 'drag-card-count-badge';
            countBadge.textContent = `🂡 ×${countSelected}`;
            avatarInner.appendChild(countBadge);
          }

          // Card clone
          const cardClone = cardEl.cloneNode(true);
          cardClone.classList.remove('is-drag-origin', 'selected');
          cardClone.style.transform = 'none';
          cardClone.style.margin = '0';
          cardClone.style.position = 'static';
          avatarInner.appendChild(cardClone);

          // Holographic glass sheen
          sheenEl = document.createElement('div');
          sheenEl.className = 'drag-hologram-sheen';
          avatarInner.appendChild(sheenEl);

          avatarContainer.appendChild(avatarInner);
          document.body.appendChild(avatarContainer);

          currentX = targetX;
          currentY = targetY;
          avatarContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%) scale(1.12)`;

          // 60/120 FPS Physics Animation Loop
          const physicsTick = () => {
            if (!isDragging || !avatarContainer) return;

            // Velocity calculation
            const vx = targetX - prevTargetX;
            const vy = targetY - prevTargetY;
            prevTargetX = targetX;
            prevTargetY = targetY;

            // Smooth velocity dampening
            smoothedVx += (vx - smoothedVx) * 0.22;
            smoothedVy += (vy - smoothedVy) * 0.22;

            // Natural dynamic roll / tilt into motion curve (max 18 deg)
            const targetTilt = Math.max(-18, Math.min(18, smoothedVx * 0.55));
            currentTilt += (targetTilt - currentTilt) * 0.16;

            // Pitch tilt (forward / backward tilt on Y motion)
            const targetPitch = Math.max(-10, Math.min(10, -smoothedVy * 0.35));
            currentPitch += (targetPitch - currentPitch) * 0.16;

            // Reactive Magnetic Pull towards Play Pile
            let effectiveTargetX = targetX;
            let effectiveTargetY = targetY;

            const pileSlot = document.getElementById('play-pile-slot');
            if (pileSlot && game && game.gamePhase === 'PLAYING' && game.activePlayerIndex === 0) {
              const pileRect = pileSlot.getBoundingClientRect();
              const pileCenterX = pileRect.left + pileRect.width / 2;
              const pileCenterY = pileRect.top + pileRect.height / 2;
              const distToPile = Math.hypot(targetX - pileCenterX, targetY - pileCenterY);
              const magnetRadius = 140;

              if (distToPile < magnetRadius) {
                const pullFactor = (1 - (distToPile / magnetRadius)) * 0.42;
                effectiveTargetX += (pileCenterX - targetX) * pullFactor;
                effectiveTargetY += (pileCenterY - targetY) * pullFactor;
                pileSlot.classList.add('drag-over');
              } else {
                pileSlot.classList.remove('drag-over');
              }
            }

            // Hover check for table stacks in SWAP phase
            if (game && game.gamePhase === 'SWAP') {
              const targetUnder = document.elementFromPoint(targetX, targetY);
              const hoveredStack = targetUnder ? targetUnder.closest('#table-cards-p0 .table-card-stack') : null;
              document.querySelectorAll('#table-cards-p0 .table-card-stack').forEach(sEl => {
                sEl.classList.toggle('drag-over', sEl === hoveredStack);
              });
            }

            // Smooth position interpolation (Lerp)
            currentX += (effectiveTargetX - currentX) * 0.35;
            currentY += (effectiveTargetY - currentY) * 0.35;

            // Apply 3D matrix transform
            avatarContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%) scale(1.12) rotate(${currentTilt.toFixed(2)}deg) rotateX(${currentPitch.toFixed(2)}deg)`;

            // Holographic sheen shift
            if (sheenEl) {
              sheenEl.style.transform = `translateX(${(currentTilt * 3.2).toFixed(1)}px) translateY(${(currentPitch * 2.2).toFixed(1)}px)`;
            }

            animFrameId = requestAnimationFrame(physicsTick);
          };

          animFrameId = requestAnimationFrame(physicsTick);
        }
      };

      const onPointerUp = (upEvt) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        if (animFrameId) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }

        try {
          cardEl.releasePointerCapture(e.pointerId);
        } catch (err) {}

        if (!isDragging) return;

        // Prevent immediate click event from firing after a drag gesture
        cardEl._justDragged = true;
        setTimeout(() => { cardEl._justDragged = false; }, 120);

        isDragging = false;
        clearAllDragOvers();

        const dropX = upEvt.clientX;
        const dropY = upEvt.clientY;
        const targetUnder = document.elementFromPoint(dropX, dropY);

        // Check Play Pile Drop
        const pileSlot = document.getElementById('play-pile-slot');
        const pileRect = pileSlot ? pileSlot.getBoundingClientRect() : null;
        const isDroppedOnPile = pileSlot && (
          (targetUnder && targetUnder.closest('#play-pile-slot')) ||
          (pileRect && Math.hypot(dropX - (pileRect.left + pileRect.width/2), dropY - (pileRect.top + pileRect.height/2)) < 90)
        );

        if (isDroppedOnPile && game && game.gamePhase === 'PLAYING' && game.activePlayerIndex === 0) {
          // Snap-in animation directly into pile center
          const pileCenterX = pileRect.left + pileRect.width / 2;
          const pileCenterY = pileRect.top + pileRect.height / 2;

          avatarContainer.classList.add('drag-snap-back');
          avatarContainer.style.transform = `translate3d(${pileCenterX}px, ${pileCenterY}px, 0) translate(-50%, -50%) scale(1) rotate(0deg)`;
          avatarContainer.style.opacity = '0.7';

          setTimeout(() => {
            if (avatarContainer) {
              avatarContainer.remove();
              avatarContainer = null;
            }
            cardEl.classList.remove('is-drag-origin');
            handleCardDropOnPile(card.id, source);
          }, 180);
          return;
        }

        // Check Swap Table Stack Drop
        if (game && game.gamePhase === 'SWAP' && source === 'HAND') {
          const tableStack = targetUnder ? targetUnder.closest('#table-cards-p0 .table-card-stack') : null;
          if (tableStack) {
            const stackRect = tableStack.getBoundingClientRect();
            const stackCenterX = stackRect.left + stackRect.width / 2;
            const stackCenterY = stackRect.top + stackRect.height / 2;

            avatarContainer.classList.add('drag-snap-back');
            avatarContainer.style.transform = `translate3d(${stackCenterX}px, ${stackCenterY}px, 0) translate(-50%, -50%) scale(1) rotate(0deg)`;

            const sIdx = Array.from(tableStack.parentNode.children).indexOf(tableStack);
            setTimeout(() => {
              if (avatarContainer) {
                avatarContainer.remove();
                avatarContainer = null;
              }
              cardEl.classList.remove('is-drag-origin');
              handleCardDropOnTableStack(card.id, sIdx);
            }, 180);
            return;
          }
        }

        // Cancelled / Invalid drop: Tactile Snap-Back to hand
        const cardOriginX = originRect.left + originRect.width / 2;
        const cardOriginY = originRect.top + originRect.height / 2;

        avatarContainer.classList.add('drag-snap-back');
        avatarContainer.style.transform = `translate3d(${cardOriginX}px, ${cardOriginY}px, 0) translate(-50%, -50%) scale(1) rotate(0deg)`;

        setTimeout(() => {
          if (avatarContainer) {
            avatarContainer.remove();
            avatarContainer = null;
          }
          cardEl.classList.remove('is-drag-origin');
        }, 250);
      };

      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    cardEl.addEventListener('pointerdown', onPointerDown);
  }

  function onHumanCardClick(source, cardId) {
    if (!game) return;

    if (game.gamePhase === 'SWAP') {
      if (source === 'HAND') {
        selectedSwapHandCardId = cardId;
        game.notifyStateChange();
      } else if (source === 'FACE_UP' && selectedSwapHandCardId) {
        game.swapCards(selectedSwapHandCardId, cardId);
        selectedSwapHandCardId = null;
      }
      return;
    }

    if (game.gamePhase === 'PLAYING' && game.activePlayerIndex === 0) {
      game.toggleCardSelection(cardId);
    }
  }

  function openModal(modalEl) {
    if (modalEl) modalEl.classList.add('open');
  }

  function closeModal(modalEl) {
    if (modalEl) modalEl.classList.remove('open');
  }

  function updateStatsDisplay() {
    try {
      const stats = (typeof statsManager !== 'undefined') ? statsManager.getStats() : { gamesPlayed: 0, wins: 0, secondPlaces: 0, thirdPlaces: 0, shitheads: 0, currentStreak: 0, bestStreak: 0, elo: 1200, peakElo: 1200, highScore: 0, totalScore: 0 };
      
      const games = stats.gamesPlayed || 0;
      const wins = stats.wins || 0;
      const podium = (stats.secondPlaces || 0) + (stats.thirdPlaces || 0);
      const shitheads = stats.shitheads || 0;
      const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
      const streak = stats.currentStreak || 0;
      const bestStreak = stats.bestStreak || 0;
      const elo = stats.elo || 1200;
      const peakElo = stats.peakElo || 1200;
      const highScore = stats.highScore || 0;
      const totalScore = stats.totalScore || 0;

      const tier = (typeof StatsManager !== 'undefined') ? StatsManager.getTier(elo) : { name: 'Silver', badge: '🥈', color: '#94a3b8', progress: 50, pointsNeeded: 100, nextTier: 'Gold' };

      // Update Rank & Tier card in modal
      const rankBadgeEl = document.getElementById('stat-rank-badge'); if (rankBadgeEl) rankBadgeEl.textContent = tier.badge;
      const rankNameEl = document.getElementById('stat-rank-name'); if (rankNameEl) { rankNameEl.textContent = tier.name; rankNameEl.style.color = tier.color; }
      const eloEl = document.getElementById('stat-elo'); if (eloEl) eloEl.textContent = elo;
      const peakEloEl = document.getElementById('stat-peak-elo'); if (peakEloEl) peakEloEl.textContent = peakElo;

      const progLabelEl = document.getElementById('stat-progress-label');
      if (progLabelEl) progLabelEl.textContent = tier.nextTier ? `Progress to ${tier.nextTier} (+${tier.pointsNeeded} Elo)` : 'Max Tier Achieved!';
      const progValEl = document.getElementById('stat-progress-val'); if (progValEl) progValEl.textContent = `${tier.progress}%`;
      const progBarEl = document.getElementById('stat-progress-bar'); if (progBarEl) progBarEl.style.width = `${tier.progress}%`;

      // High scores & career totals
      const hsEl = document.getElementById('stat-highscore'); if (hsEl) hsEl.textContent = highScore;
      const tsEl = document.getElementById('stat-totalscore'); if (tsEl) tsEl.textContent = totalScore;

      // Base rows
      const gEl = document.getElementById('stat-games'); if (gEl) gEl.textContent = games;
      const wEl = document.getElementById('stat-wins'); if (wEl) wEl.textContent = wins;
      const pEl = document.getElementById('stat-podium'); if (pEl) pEl.textContent = podium;
      const sEl = document.getElementById('stat-shitheads'); if (sEl) sEl.textContent = shitheads;
      const wrEl = document.getElementById('stat-winrate'); if (wrEl) wrEl.textContent = `${winRate}%`;
      const stEl = document.getElementById('stat-streak'); if (stEl) stEl.textContent = streak;
      const bstEl = document.getElementById('stat-best-streak'); if (bstEl) bstEl.textContent = bestStreak;

      // Keep header in sync
      updateHeaderElo();
    } catch (e) {
      console.warn('Could not update stats display:', e);
    }
  }

  let currentLeaderboardMode = 'score';

  function updateProfileUI() {
    if (typeof profileManager === 'undefined') return;
    const profile = profileManager.getProfile();
    const displayName = profileManager.getDisplayName();

    // Settings Profile Card
    const nameEl = document.getElementById('settings-player-name');
    if (nameEl) nameEl.textContent = displayName;

    const cloudStatusEl = document.getElementById('settings-cloud-status');
    if (cloudStatusEl) {
      if (profile.isGooglePlayLinked) {
        cloudStatusEl.textContent = `Connected to Google Play • Cloud Synced`;
        cloudStatusEl.style.color = '#4ade80';
      } else {
        cloudStatusEl.textContent = `Offline Guest (Saving Locally)`;
        cloudStatusEl.style.color = '#94a3b8';
      }
    }

    const gpBtn = document.getElementById('settings-gp-link-btn');
    if (gpBtn) {
      if (profile.isGooglePlayLinked) {
        gpBtn.classList.add('is-linked');
        gpBtn.innerHTML = `<span>✓ Google Play Linked (${profile.googlePlayGamerTag})</span>`;
      } else {
        gpBtn.classList.remove('is-linked');
        gpBtn.innerHTML = `<span>🎮 Link Google Play Account</span>`;
      }
    }

    // Leaderboard Banner
    const lbStatusEl = document.getElementById('gp-banner-status');
    if (lbStatusEl) {
      if (profile.isGooglePlayLinked) {
        lbStatusEl.textContent = `Connected as ${profile.googlePlayGamerTag} • Cloud Synced`;
        lbStatusEl.style.color = '#4ade80';
      } else {
        lbStatusEl.textContent = `Offline Guest • Link Google Play to verify rank`;
        lbStatusEl.style.color = '#94a3b8';
      }
    }

    const lbGpBtn = document.getElementById('leaderboard-gp-link-btn');
    if (lbGpBtn) {
      if (profile.isGooglePlayLinked) {
        lbGpBtn.classList.add('is-connected');
        lbGpBtn.textContent = 'Linked';
      } else {
        lbGpBtn.classList.remove('is-connected');
        lbGpBtn.textContent = 'Link Account';
      }
    }
  }

  function handleGooglePlayToggle() {
    if (typeof profileManager === 'undefined') return;
    const profile = profileManager.getProfile();

    if (profile.isGooglePlayLinked) {
      if (confirm(`Unlink Google Play account (${profile.googlePlayGamerTag})? Your stats will continue saving locally.`)) {
        profileManager.unlinkGooglePlayAccount();
        updateProfileUI();
        updateLeaderboardDisplay(currentLeaderboardMode);
      }
    } else {
      const currentName = profileManager.getDisplayName();
      const suggestedTag = `PlayGamer_${currentName.replace(/[^a-zA-Z0-9]/g, '')}`;
      const enteredTag = prompt('Link Google Play Games Account:\nEnter your Google Play Gamer Tag:', suggestedTag);
      if (enteredTag !== null) {
        const cleanTag = enteredTag.trim() || suggestedTag;
        profileManager.linkGooglePlayAccount(cleanTag);
        if (typeof statsManager !== 'undefined') {
          profileManager.syncCloudScores(statsManager.getStats());
        }
        updateProfileUI();
        updateLeaderboardDisplay(currentLeaderboardMode);
        alert(`🎮 Google Play Account Linked as "${cleanTag}"!\nYour high score and Elo rating are synced to the cloud.`);
      }
    }
  }

  function updateLeaderboardDisplay(mode = 'score') {
    if (typeof leaderboardManager === 'undefined') return;
    currentLeaderboardMode = mode;

    const stats = (typeof statsManager !== 'undefined')
      ? statsManager.getStats()
      : { highScore: 0, elo: 1200 };
    const displayName = (typeof profileManager !== 'undefined')
      ? profileManager.getDisplayName()
      : 'You';
    const tier = (typeof StatsManager !== 'undefined')
      ? StatsManager.getTier(stats.elo)
      : { name: 'Silver', badge: '🥈' };

    const data = leaderboardManager.getLeaderboardDisplay({
      userScore: stats.highScore || 0,
      userElo: stats.elo || 1200,
      userName: displayName,
      userTier: tier,
      mode: currentLeaderboardMode
    });

    // Update Tab styling
    const tabScore = document.getElementById('lb-tab-score');
    const tabElo = document.getElementById('lb-tab-elo');
    if (tabScore) tabScore.classList.toggle('is-active', currentLeaderboardMode === 'score');
    if (tabElo) tabElo.classList.toggle('is-active', currentLeaderboardMode === 'elo');

    const colHeader = document.getElementById('lb-metric-header');
    if (colHeader) colHeader.textContent = currentLeaderboardMode === 'elo' ? 'Elo Rating' : 'High Score';

    const container = document.getElementById('leaderboard-rows-container');
    if (!container) return;
    container.innerHTML = '';

    const medals = ['🥇', '🥈', '🥉'];

    data.items.forEach((item) => {
      // If this item is the pinned 11th spot, insert the divider right before it!
      if (item.isPinned11th) {
        const divider = document.createElement('div');
        divider.className = 'lb-pinned-divider';
        divider.textContent = '─── YOUR GLOBAL STANDING ───';
        container.appendChild(divider);
      }

      const row = document.createElement('div');
      const isPodium = item.rank <= 3 && !item.isPinned11th;
      const podiumClass = item.rank === 1 ? 'lb-podium-1' : item.rank === 2 ? 'lb-podium-2' : item.rank === 3 ? 'lb-podium-3' : '';
      row.className = `lb-row ${item.isUser ? 'is-user' : ''} ${item.isPinned11th ? 'is-pinned-11th' : ''} ${podiumClass}`;

      const rankBadge = isPodium ? medals[item.rank - 1] : `#${item.rank}`;
      const scoreVal = currentLeaderboardMode === 'elo' ? `${item.elo}` : `${item.score}`;

      row.innerHTML = `
        <div class="lb-col-rank">
          <span class="lb-rank-num">${rankBadge}</span>
        </div>
        <div class="lb-col-player">
          <span class="lb-player-flag">${item.country || '🎮'}</span>
          <span>${item.name}</span>
          ${item.isUser ? '<span class="lb-user-tag">YOU</span>' : ''}
        </div>
        <div class="lb-col-tier">
          <span>${item.tier ? item.tier.badge : '🥈'}</span>
          <span>${item.tier ? item.tier.name : 'Silver'}</span>
        </div>
        <div class="lb-col-score">
          ${scoreVal}
        </div>
      `;

      container.appendChild(row);
    });
  }

  function showGameOverModal(state) {
    if (!modalGameOver || !state || state.gamePhase !== 'ENDED') return;
    if (gameOverModalShownForCurrentGame) return;
    gameOverModalShownForCurrentGame = true;

    const winners = state.winners || [];
    const winner = winners.length > 0 ? winners[0] : null;
    const shithead = state.shithead || null;
    const humanWon = winner && winner.isHuman;
    const humanIsShithead = shithead && shithead.isHuman;

    const titleEl = document.getElementById('game-over-title');
    const iconEl = document.getElementById('game-over-icon');
    const badgeEl = document.getElementById('game-over-badge');
    const nameEl = document.getElementById('game-over-winner-name');
    const subtitleEl = document.getElementById('game-over-subtitle');
    const standingsList = document.getElementById('game-over-standings');

    if (humanWon) {
      if (titleEl) titleEl.textContent = '🎉 VICTORY!';
      if (iconEl) iconEl.textContent = '👑';
      if (badgeEl) {
        badgeEl.textContent = 'CHAMPION';
        badgeEl.style.borderColor = 'var(--accent-gold)';
        badgeEl.style.color = 'var(--accent-gold)';
      }
      if (nameEl) nameEl.textContent = 'You Won 1st Place!';
      if (subtitleEl) subtitleEl.textContent = 'Spectacular match! You cleared all your cards first.';
    } else if (humanIsShithead) {
      if (titleEl) titleEl.textContent = '💀 SHITHEAD!';
      if (iconEl) iconEl.textContent = '💩';
      if (badgeEl) {
        badgeEl.textContent = 'THE SHITHEAD';
        badgeEl.style.borderColor = 'var(--accent-rose)';
        badgeEl.style.color = 'var(--accent-rose)';
      }
      if (nameEl) nameEl.textContent = 'You are the SHITHEAD!';
      if (subtitleEl) subtitleEl.textContent = `Winner was ${winner ? winner.name : 'Unknown'}. Better luck next game!`;
    } else {
      if (titleEl) titleEl.textContent = '👏 GAME OVER';
      if (iconEl) iconEl.textContent = '🏆';
      if (badgeEl) {
        badgeEl.textContent = 'WINNER';
        badgeEl.style.borderColor = 'var(--accent-gold)';
        badgeEl.style.color = 'var(--accent-gold)';
      }
      if (nameEl) nameEl.textContent = `${winner ? winner.name : 'Winner'} Won!`;
      const humanPlace = winners.findIndex(w => w.isHuman) + 1;
      if (subtitleEl) subtitleEl.textContent = humanPlace > 0 ? `You placed ${humanPlace}${getOrdinalSuffix(humanPlace)}!` : 'Good game!';
    }

    // Populate Match Score & Elo in Game Over screen
    const matchScore = state.matchScore || 0;
    const summary = state.scoreSummary || null;

    const goScoreEl = document.getElementById('game-over-match-score');
    if (goScoreEl) goScoreEl.textContent = matchScore;

    const goHighBadge = document.getElementById('game-over-high-badge');
    if (goHighBadge) {
      goHighBadge.style.display = (summary && summary.isNewHighScore) ? 'inline-block' : 'none';
    }

    const goEloDelta = document.getElementById('game-over-elo-delta');
    const goEloCur = document.getElementById('game-over-elo-current');
    if (summary) {
      const delta = summary.eloDelta || 0;
      if (goEloDelta) {
        goEloDelta.textContent = delta > 0 ? `+${delta}` : `${delta}`;
        goEloDelta.style.color = delta > 0 ? '#4ade80' : delta < 0 ? 'var(--accent-rose)' : 'var(--accent-gold)';
      }
      if (goEloCur) {
        goEloCur.textContent = `${summary.newElo} Rating`;
      }

      const newTier = summary.newTier || (typeof StatsManager !== 'undefined' ? StatsManager.getTier(summary.newElo) : { name: 'Silver', badge: '🥈', progress: 50 });
      const tierNameEl = document.getElementById('game-over-tier-name');
      if (tierNameEl) tierNameEl.textContent = `${newTier.badge} ${newTier.name} Tier`;

      const tierProgEl = document.getElementById('game-over-tier-progress');
      if (tierProgEl) tierProgEl.textContent = `${newTier.progress}%`;

      const tierBarEl = document.getElementById('game-over-tier-bar');
      if (tierBarEl) {
        tierBarEl.style.width = '0%';
        setTimeout(() => {
          tierBarEl.style.width = `${newTier.progress}%`;
        }, 300);
      }

      const promoBanner = document.getElementById('game-over-promo-banner');
      if (promoBanner) {
        if (summary.promoted) {
          promoBanner.style.display = 'block';
          promoBanner.textContent = `🎉 PROMOTED TO ${newTier.name.toUpperCase()} TIER!`;
        } else if (summary.demoted) {
          promoBanner.style.display = 'block';
          promoBanner.textContent = `⚠️ Demoted to ${newTier.name} Tier`;
        } else {
          promoBanner.style.display = 'none';
        }
      }
    }

    // Build standings list
    if (standingsList) {
      standingsList.innerHTML = '';

      // Add winners in order
      const medals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place'];
      winners.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = `standings-row ${idx === 0 ? 'is-winner' : ''}`;
        row.innerHTML = `
          <div class="standings-rank">
            <span>${medals[idx] || `${idx + 1}th Place`}</span>
            <strong>${p.name}${p.isHuman ? ' (You)' : ''}</strong>
          </div>
          <span class="standings-tag">${idx === 0 ? 'WINNER 🏆' : 'CLEARED'}</span>
        `;
        standingsList.appendChild(row);
      });

      // Add Shithead (the final loser)
      if (shithead) {
        const row = document.createElement('div');
        row.className = 'standings-row is-shithead';
        row.innerHTML = `
          <div class="standings-rank">
            <span>💀 Shithead</span>
            <strong>${shithead.name}${shithead.isHuman ? ' (You)' : ''}</strong>
          </div>
          <span class="standings-tag">LOSER 💩</span>
        `;
        standingsList.appendChild(row);
      }
    }

    updateStatsDisplay();

    setTimeout(() => {
      openModal(modalGameOver);
    }, 450);
  }

  function getOrdinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  // PWA Registration & Install Prompt
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[SW] Registered successfully:', reg.scope))
        .catch(err => console.error('[SW] Registration failed:', err));
    });
  }

  let deferredPrompt = null;
  const pwaInstallBtn = document.getElementById('pwa-install-btn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaInstallBtn) {
      pwaInstallBtn.style.display = 'flex';
      pwaInstallBtn.addEventListener('click', () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              console.log('User accepted PWA installation');
              pwaInstallBtn.style.display = 'none';
            }
            deferredPrompt = null;
          });
        }
      });
    }
  });

  // Start initial game or prompt difficulty
  if (GameEngine.getSavedActiveGame()) {
    startNewGame(false);
  } else {
    openPreGameModal();
  }
});
