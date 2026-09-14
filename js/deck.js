/**
 * Deck Model
 * Manages standard 52-card deck generation, shuffling, and dealing.
 */

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    const suits = Object.values(Card.SUITS);
    for (const suit of suits) {
      for (const rankInfo of Card.RANKS) {
        this.cards.push(new Card(suit, rankInfo.label, rankInfo.value));
      }
    }
  }

  shuffle() {
    // Fisher-Yates Shuffle
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    return this.cards.pop() || null;
  }

  get remaining() {
    return this.cards.length;
  }

  isEmpty() {
    return this.cards.length === 0;
  }

  static fromJSON(data) {
    const deck = new Deck();
    deck.cards = [];
    if (data && Array.isArray(data.cards)) {
      deck.cards = data.cards.map(c => Card.fromJSON(c));
    }
    return deck;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Deck;
}
