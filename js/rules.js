/**
 * Shithead Rules & Move Validation Engine
 */

class Rules {
  constructor(options = {}) {
    this.options = {
      special7Lower: true,       // 7 means next player must play <= 7
      special8Transparent: true, // 8 is transparent (effective rank is card under 8)
      special4Reverse: true,     // 4 reverses the order of play
      special2PlayAgain: false,  // 2 allows player to play again immediately
      burnOnFourOfAKind: true,   // 4 of a kind on pile causes burn
      allowMultipleSameRank: true, // Can play multiple cards of same rank at once
      ...options
    };
  }

  /**
   * Find the "effective" top card of the play pile.
   * If 8 is played and transparent8 rule is enabled, look down the stack for the first non-8 card.
   */
  getEffectiveTopCard(pile) {
    if (!pile || pile.length === 0) return null;

    if (!this.options.special8Transparent) {
      return pile[pile.length - 1];
    }

    // Scan backwards from top of pile for non-8 card
    for (let i = pile.length - 1; i >= 0; i--) {
      if (pile[i].rank !== '8') {
        return pile[i];
      }
    }
    // If pile is only 8s, return null (any card can be played)
    return null;
  }

  /**
   * Check if a set of cards (must be same rank) is valid to play on the current pile.
   */
  isValidPlay(cardsToPlay, pile) {
    if (!cardsToPlay || cardsToPlay.length === 0) return false;

    // All played cards must be of the same rank
    const firstRank = cardsToPlay[0].rank;
    if (!cardsToPlay.every(c => c.rank === firstRank)) {
      return false;
    }

    // Empty pile: Any card is valid!
    if (!pile || pile.length === 0) return true;

    // Special wildcards: 2 (reset), 10 (burn), invisible 8, and reverse 4 can be played on ANYTHING
    if (
      firstRank === '2' ||
      firstRank === '10' ||
      (firstRank === '8' && this.options.special8Transparent) ||
      (firstRank === '4' && this.options.special4Reverse)
    ) {
      return true;
    }

    const effectiveTopCard = this.getEffectiveTopCard(pile);
    if (!effectiveTopCard) return true; // Effective pile is reset or empty

    // Rule: 7 Special Card (Must play <= 7)
    if (this.options.special7Lower && effectiveTopCard.rank === '7') {
      return cardsToPlay[0].value <= 7;
    }

    // Standard Rule: Must play card equal to or higher than effective top card
    return cardsToPlay[0].value >= effectiveTopCard.value;
  }

  /**
   * Check if playing these cards (or accumulated pile) results in a Pile Burn.
   * Returns object: { burn: boolean, reason: '10' | 'fourOfAKind' | null }
   */
  checkBurn(cardsJustPlayed, updatedPile) {
    if (!cardsJustPlayed || cardsJustPlayed.length === 0) {
      return { burn: false, reason: null };
    }

    // 1. Played a 10
    if (cardsJustPlayed[0].rank === '10') {
      return { burn: true, reason: '10' };
    }

    // 2. Four of a kind on top of the pile
    if (this.options.burnOnFourOfAKind && updatedPile && updatedPile.length >= 4) {
      const topRank = updatedPile[updatedPile.length - 1].rank;
      let count = 0;
      for (let i = updatedPile.length - 1; i >= 0; i--) {
        if (updatedPile[i].rank === topRank) {
          count++;
        } else {
          break;
        }
      }
      if (count >= 4) {
        return { burn: true, reason: 'fourOfAKind' };
      }
    }

    return { burn: false, reason: null };
  }

  /**
   * Find all valid playable card groups from a player's available hand/table cards.
   * Returns an array of Card arrays.
   */
  getValidMoves(availableCards, pile) {
    if (!availableCards || availableCards.length === 0) return [];

    // Group cards by rank
    const rankGroups = {};
    for (const card of availableCards) {
      if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
      rankGroups[card.rank].push(card);
    }

    const validMoves = [];
    for (const rank in rankGroups) {
      const group = rankGroups[rank];
      // Single card or multiples
      if (this.isValidPlay([group[0]], pile)) {
        validMoves.push(group); // Full group (playing all cards of that rank)
        if (group.length > 1) {
          // Also allow playing single or subsets if allowed
          validMoves.push([group[0]]);
        }
      }
    }

    return validMoves;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rules;
}
