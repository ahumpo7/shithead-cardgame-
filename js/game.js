/**
 * Master Game Controller & State Manager
 * Coordinates game rules, turns, AI, UI rendering updates, and user interactions.
 */

class GameEngine {
  constructor(options = {}) {
    this.playerCount = options.playerCount || 4; // 2, 3, or 4 players
    this.aiDifficulty = options.aiDifficulty || 'medium';
    this.sound = options.sound || new SoundSynthesizer();
    this.rules = new Rules(options.ruleSettings || {});
    this.ai = new AI(this.aiDifficulty, this.rules);

    // State variables
    this.deck = new Deck();
    this.playPile = [];
    this.burnPile = [];
    this.players = []; // Array of Player objects
    this.activePlayerIndex = 0;
    this.playDirection = 1; // 1 = clockwise, -1 = counter-clockwise
    this.gamePhase = 'INIT'; // 'INIT' | 'SWAP' | 'PLAYING' | 'ENDED'
    this.winners = []; // Array of finished player objects in winning order
    this.shithead = null; // The final loser
    this.isFastSimulating = false; // Fast sim AI turns once human finishes
    this.selectedCardIds = new Set();
    this.statusMessage = '';

    this.onStateChange = options.onStateChange || (() => {});
  }

  initNewGame() {
    this.deck.reset();
    this.deck.shuffle();
    this.playPile = [];
    this.burnPile = [];
    this.winners = [];
    this.shithead = null;
    this.isFastSimulating = false;
    this.selectedCardIds.clear();
    this.playDirection = 1;
    this.gamePhase = 'SWAP';

    // Initialize Players
    this.players = [];
    // Player 0 is Human
    this.players.push({
      id: 'p0',
      name: 'You',
      isHuman: true,
      hand: [],
      faceUp: [],
      faceDown: [],
      ready: false,
      finished: false
    });

    // AI Players
    const botNames = ['Alex (AI)', 'Sam (AI)', 'Jordan (AI)'];
    for (let i = 1; i < this.playerCount; i++) {
      this.players.push({
        id: `p${i}`,
        name: botNames[i - 1],
        isHuman: false,
        hand: [],
        faceUp: [],
        faceDown: [],
        ready: true,
        finished: false
      });
    }

    // Deal cards: 3 Face-Down, 3 Face-Up, 3 Hand to each player
    for (let round = 0; round < 3; round++) {
      for (const p of this.players) p.faceDown.push(this.deck.draw());
    }
    for (let round = 0; round < 3; round++) {
      for (const p of this.players) p.faceUp.push(this.deck.draw());
    }
    for (let round = 0; round < 3; round++) {
      for (const p of this.players) p.hand.push(this.deck.draw());
    }

    // Sort human player's hand by card value
    this.sortHand(this.players[0]);

    // AI auto-performs optimal swap phase
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      const result = this.ai.decideSwaps(p.hand, p.faceUp);
      for (const swap of result.swaps) {
        const hIdx = p.hand.findIndex(c => c.id === swap.handCard.id);
        const fIdx = p.faceUp.findIndex(c => c.id === swap.faceUpCard.id);
        if (hIdx !== -1 && fIdx !== -1) {
          [p.hand[hIdx], p.faceUp[fIdx]] = [p.faceUp[fIdx], p.hand[hIdx]];
        }
      }
    }

    this.sound.playCardDeal();
    this.statusMessage = 'Swap Phase: Tap a card in hand and a face-up card to swap them before starting!';
    this.notifyStateChange();
  }

  sortHand(player) {
    player.hand.sort((a, b) => a.value - b.value);
  }

  // Swap phase human action
  swapCards(handCardId, faceUpCardId) {
    if (this.gamePhase !== 'SWAP') return false;
    const human = this.players[0];

    const hIdx = human.hand.findIndex(c => c.id === handCardId);
    const fIdx = human.faceUp.findIndex(c => c.id === faceUpCardId);

    if (hIdx !== -1 && fIdx !== -1) {
      [human.hand[hIdx], human.faceUp[fIdx]] = [human.faceUp[fIdx], human.hand[hIdx]];
      this.sortHand(human);
      this.sound.playClick();
      this.notifyStateChange();
      return true;
    }
    return false;
  }

  finishSwapPhase() {
    if (this.gamePhase !== 'SWAP') return;
    this.players[0].ready = true;
    this.gamePhase = 'PLAYING';

    // Determine starting player: player with lowest starting card in hand
    let lowestVal = 999;
    let startingIdx = 0;

    for (let i = 0; i < this.players.length; i++) {
      const minCard = this.players[i].hand.reduce((min, c) => (c.value < min.value ? c : min), this.players[i].hand[0]);
      if (minCard && minCard.value < lowestVal) {
        lowestVal = minCard.value;
        startingIdx = i;
      }
    }

    this.activePlayerIndex = startingIdx;
    const starterName = this.players[startingIdx].name;
    this.statusMessage = `${starterName} has the lowest card (${lowestVal}) and starts first!`;
    this.sound.playClick();
    this.notifyStateChange();

    // If starting player is AI, trigger bot turn
    if (!this.players[this.activePlayerIndex].isHuman) {
      this.scheduleAITurn();
    }
  }

  getCurrentPlayer() {
    return this.players[this.activePlayerIndex];
  }

  /**
   * Determine which set of cards a player is currently playing from:
   * 'HAND' | 'FACE_UP' | 'FACE_DOWN'
   */
  getPlayerActivePhase(player) {
    if (player.hand.length > 0) return 'HAND';
    if (player.faceUp.length > 0) return 'FACE_UP';
    if (player.faceDown.length > 0) return 'FACE_DOWN';
    return 'DONE';
  }

  getAvailableCardsForPlayer(player) {
    const phase = this.getPlayerActivePhase(player);
    if (phase === 'HAND') return player.hand;
    if (phase === 'FACE_UP') return player.faceUp;
    if (phase === 'FACE_DOWN') return player.faceDown;
    return [];
  }

  /**
   * User Card Selection Logic:
   * Multi-select cards of the SAME rank.
   */
  toggleCardSelection(cardId) {
    if (this.gamePhase !== 'PLAYING') return;
    const human = this.players[0];
    if (this.activePlayerIndex !== 0) return; // Not human's turn

    const phase = this.getPlayerActivePhase(human);
    const available = this.getAvailableCardsForPlayer(human);
    const card = available.find(c => c.id === cardId);

    if (!card) return;

    if (phase === 'FACE_DOWN') {
      // Blind flip phase! Selecting a face-down card immediately attempts to play it
      this.playBlindCard(human, card);
      return;
    }

    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
    } else {
      // Check if selection rank matches existing selected cards
      if (this.selectedCardIds.size > 0) {
        const firstSelectedId = Array.from(this.selectedCardIds)[0];
        const firstSelectedCard = available.find(c => c.id === firstSelectedId);
        if (firstSelectedCard && firstSelectedCard.rank !== card.rank) {
          // Different rank selected: reset selection to new rank
          this.selectedCardIds.clear();
        }
      }
      this.selectedCardIds.add(cardId);
    }

    this.sound.playClick();
    this.notifyStateChange();
  }

  playSelectedCards() {
    if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== 0) return false;
    const human = this.players[0];
    const available = this.getAvailableCardsForPlayer(human);

    const cardsToPlay = available.filter(c => this.selectedCardIds.has(c.id));
    if (cardsToPlay.length === 0) return false;

    if (!this.rules.isValidPlay(cardsToPlay, this.playPile)) {
      const eff = this.rules.getEffectiveTopCard(this.playPile);
      const effDesc = eff ? `${eff.rank}${eff.suit.symbol}` : 'empty pile';
      this.statusMessage = `Invalid play! Must be ≥ ${effDesc}, or a wildcard 2, 10, 8, or 4 (reverse).`;
      this.sound.playDefeat();
      this.notifyStateChange();
      return false;
    }

    this.executePlay(human, cardsToPlay);
    this.selectedCardIds.clear();
    return true;
  }

  playDirectCards(cardsToPlay) {
    if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== 0) return false;
    const human = this.players[0];
    if (!cardsToPlay || cardsToPlay.length === 0) return false;

    if (!this.rules.isValidPlay(cardsToPlay, this.playPile)) {
      const topCard = this.rules.getEffectiveTopCard(this.playPile);
      const topDesc = topCard ? `${topCard.rank}${topCard.suit.symbol}` : 'empty pile';
      this.statusMessage = `Invalid play! Card must be ≥ ${topDesc}, or a wildcard 2, 10, 8, or 4 (reverse).`;
      this.sound.playDefeat();
      this.notifyStateChange();
      return false;
    }

    this.executePlay(human, cardsToPlay);
    this.selectedCardIds.clear();
    return true;
  }

  playBlindCard(player, card) {
    // Remove card from faceDown array
    const idx = player.faceDown.findIndex(c => c.id === card.id);
    if (idx !== -1) player.faceDown.splice(idx, 1);

    card.faceUp = true;
    const cardsToPlay = [card];

    if (this.rules.isValidPlay(cardsToPlay, this.playPile)) {
      this.statusMessage = `${player.name} blindly flipped a valid ${card.toString()}!`;
      this.executePlay(player, cardsToPlay);
    } else {
      // Invalid flip! Pick up the entire pile AND the flipped card goes into hand!
      this.statusMessage = `${player.name} flipped an invalid ${card.toString()}! Must pick up pile.`;
      player.hand.push(card);
      this.executePickup(player);
    }
  }

  executePlay(player, cardsToPlay) {
    const phase = this.getPlayerActivePhase(player);

    // Remove played cards from source container
    if (phase === 'HAND') {
      player.hand = player.hand.filter(c => !cardsToPlay.some(p => p.id === c.id));
    } else if (phase === 'FACE_UP') {
      player.faceUp = player.faceUp.filter(c => !cardsToPlay.some(p => p.id === c.id));
    }

    // Add cards to play pile
    this.playPile.push(...cardsToPlay);
    this.sound.playCardSnap();

    // Check for Burn
    const burnResult = this.rules.checkBurn(cardsToPlay, this.playPile);

    if (burnResult.burn) {
      // Burn pile!
      this.burnPile.push(...this.playPile);
      this.playPile = [];
      this.sound.playBurn();

      // If cards played were 4s with special4Reverse enabled, reverse direction for each 4
      if (cardsToPlay[0].rank === '4' && this.rules.options.special4Reverse) {
        for (let i = 0; i < cardsToPlay.length; i++) {
          this.playDirection *= -1;
        }
      }

      const reasonMsg = burnResult.reason === '10' ? '10 Burn!' : '4 of a Kind Burn!';
      this.statusMessage = `🔥 ${player.name} played ${reasonMsg} Pile cleared! ${player.name} plays again.`;

      // Replenish hand if needed
      this.replenishHand(player);
      this.checkPlayerFinished(player);

      this.notifyStateChange();

      if (this.gamePhase === 'ENDED') return;

      if (player.finished) {
        this.advanceTurn();
      } else if (!player.isHuman) {
        this.scheduleAITurn();
      }
      return;
    }

    // Normal play (no burn)
    let extraStatus = '';
    // Rule: 4 Reverses Order of Play
    if (cardsToPlay[0].rank === '4' && this.rules.options.special4Reverse) {
      for (let i = 0; i < cardsToPlay.length; i++) {
        this.playDirection *= -1;
      }
      extraStatus += ` 🔄 Play reversed to ${this.playDirection === 1 ? 'clockwise' : 'counter-clockwise'}!`;
    }

    // Rule: 2 Play Again
    const is2PlayAgain = cardsToPlay[0].rank === '2' && this.rules.options.special2PlayAgain;

    // Rule: 8 Invisible Card
    if (cardsToPlay[0].rank === '8' && this.rules.options.special8Transparent) {
      const eff = this.rules.getEffectiveTopCard(this.playPile);
      extraStatus += ` 👻 Invisible 8! (Underneath: ${eff ? eff.toString() : 'Empty Pile'})`;
    }

    this.statusMessage = `${player.name} played ${cardsToPlay.map(c => c.toString()).join(', ')}.${extraStatus}`;
    this.replenishHand(player);
    this.checkPlayerFinished(player);

    if (this.gamePhase === 'ENDED') {
      this.notifyStateChange();
      return;
    }

    if (is2PlayAgain && !player.finished) {
      this.statusMessage += ` ⚡ ${player.name} plays again!`;
      this.notifyStateChange();
      if (!player.isHuman) {
        this.scheduleAITurn();
      }
      return;
    }

    this.advanceTurn();
  }

  executePickup(player) {
    // Player picks up play pile
    player.hand.push(...this.playPile);
    this.playPile = [];
    this.sortHand(player);
    this.sound.playPilePickup();

    this.statusMessage = `📥 ${player.name} picked up the play pile!`;
    this.notifyStateChange();

    this.advanceTurn();
  }

  pickupPileHuman() {
    if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== 0) return;
    const human = this.players[0];
    if (this.playPile.length === 0) return;

    this.selectedCardIds.clear();
    this.executePickup(human);
  }

  replenishHand(player) {
    while (player.hand.length < 3 && !this.deck.isEmpty()) {
      const card = this.deck.draw();
      if (card) {
        player.hand.push(card);
      }
    }
    this.sortHand(player);
  }

  checkPlayerFinished(player) {
    if (player.finished) return;

    if (player.hand.length === 0 && player.faceUp.length === 0 && player.faceDown.length === 0) {
      player.finished = true;
      this.winners.push(player);
      this.sound.playVictory();

      const rankStr = this.winners.length === 1 ? '1st (WINNER!)' : `${this.winners.length}th place`;
      this.statusMessage = `🎉 ${player.name} cleared all cards and placed ${rankStr}!`;

      // Check if game is over (only 1 player remaining with cards)
      const activePlayers = this.players.filter(p => !p.finished);
      if (activePlayers.length === 1) {
        this.shithead = activePlayers[0];
        this.gamePhase = 'ENDED';
        this.isFastSimulating = false;
        this.statusMessage = `💀 Game Over! ${this.shithead.name} is the SHITHEAD!`;
        this.saveStats();
        this.notifyStateChange();
      } else if (player.isHuman) {
        // Human player cleared all cards! Fast-sim the remaining bot players automatically
        this.isFastSimulating = true;
        this.statusMessage = `🎉 You placed ${rankStr}! Fast-simulating remaining players...`;
        this.notifyStateChange();
      }
    }
  }

  advanceTurn() {
    if (this.gamePhase === 'ENDED') return;

    // Find next non-finished player in current direction (1 = clockwise, -1 = counter-clockwise)
    const step = this.playDirection || 1;
    let nextIdx = (this.activePlayerIndex + step + this.players.length) % this.players.length;
    while (this.players[nextIdx].finished) {
      nextIdx = (nextIdx + step + this.players.length) % this.players.length;
    }

    this.activePlayerIndex = nextIdx;
    this.notifyStateChange();

    if (!this.players[this.activePlayerIndex].isHuman) {
      this.scheduleAITurn();
    }
  }

  scheduleAITurn() {
    if (this.gamePhase !== 'PLAYING') return;
    const bot = this.players[this.activePlayerIndex];
    if (!bot || bot.isHuman || bot.finished) return;

    // Fast simulation delay (110ms) when human is already finished vs normal thinking time (900ms)
    const delay = this.isFastSimulating ? 110 : 900;

    setTimeout(() => {
      if (this.gamePhase !== 'PLAYING' || this.activePlayerIndex !== this.players.indexOf(bot)) return;

      const phase = this.getPlayerActivePhase(bot);
      const available = this.getAvailableCardsForPlayer(bot);

      if (phase === 'FACE_DOWN') {
        // AI flips random face-down card
        const randomCard = available[Math.floor(Math.random() * available.length)];
        this.playBlindCard(bot, randomCard);
        return;
      }

      const move = this.ai.decideMove(available, this.playPile, phase);
      if (move) {
        this.executePlay(bot, move);
      } else {
        this.executePickup(bot);
      }
    }, delay);
  }

  saveStats() {
    try {
      const statsStr = localStorage.getItem('shithead_pwa_stats');
      const stats = statsStr ? JSON.parse(statsStr) : { gamesPlayed: 0, wins: 0, losses: 0, shitheads: 0 };
      stats.gamesPlayed++;
      if (this.winners[0] && this.winners[0].isHuman) {
        stats.wins++;
      }
      if (this.shithead && this.shithead.isHuman) {
        stats.shitheads++;
      } else if (!this.winners.some(w => w.isHuman)) {
        stats.losses++;
      }
      localStorage.setItem('shithead_pwa_stats', JSON.stringify(stats));
    } catch (e) {
      console.warn('LocalStorage unavailable for stats:', e);
    }
  }

  notifyStateChange() {
    this.onStateChange({
      gamePhase: this.gamePhase,
      activePlayer: this.getCurrentPlayer(),
      activePlayerIndex: this.activePlayerIndex,
      playDirection: this.playDirection,
      ruleSettings: this.rules.options,
      players: this.players,
      playPile: this.playPile,
      burnPile: this.burnPile,
      deckRemaining: this.deck.remaining,
      effectiveTopCard: this.rules.getEffectiveTopCard(this.playPile),
      selectedCardIds: Array.from(this.selectedCardIds),
      statusMessage: this.statusMessage,
      winners: this.winners,
      shithead: this.shithead,
      isFastSimulating: this.isFastSimulating
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameEngine;
}
