/**
 * AI Opponent Decision Engine
 * Supports Easy, Medium, and Hard AI bot difficulty levels with strategic swap & card play logic.
 */

class AI {
  constructor(difficulty = 'medium', rulesEngine) {
    this.difficulty = difficulty; // 'easy' | 'medium' | 'hard'
    this.rules = rulesEngine || new Rules();
  }

  /**
   * AI Swap Phase Logic:
   * Decide which cards to swap between hand and face-up table cards before game starts.
   */
  decideSwaps(hand, faceUpCards) {
    if (!hand || !faceUpCards || hand.length === 0 || faceUpCards.length === 0) {
      return { swaps: [] };
    }

    // High value target cards for table face-up (Power cards & High ranks: 10, 2, A, K, Q, J, 7, 8)
    const getCardPower = (card) => {
      if (card.rank === '10') return 100; // Best card on table
      if (card.rank === '2') return 90;   // Reset card
      if (card.rank === 'A') return 80;   // High card
      if (card.rank === 'K') return 70;
      if (card.rank === 'Q') return 60;
      if (card.rank === 'J') return 50;
      if (card.rank === '8') return 45;
      if (card.rank === '7') return 40;
      return card.value;                  // 3-6 low value
    };

    const allCards = [...hand, ...faceUpCards];
    // Sort all available 6 cards by power descending
    allCards.sort((a, b) => getCardPower(b) - getCardPower(a));

    // Best 3 cards belong on face-up table, remaining 3 in hand
    const targetFaceUp = allCards.slice(0, 3);
    const targetHand = allCards.slice(3, 6);

    const swaps = [];
    // Compare current face-up cards to target face-up
    const currentFaceUp = [...faceUpCards];
    const currentHand = [...hand];

    for (let i = 0; i < currentFaceUp.length; i++) {
      const faceUpCard = currentFaceUp[i];
      // If this face-up card is not in target face-up, swap with a target card in hand
      if (!targetFaceUp.some(c => c.id === faceUpCard.id)) {
        // Find a hand card that IS in targetFaceUp
        const swapPartnerIndex = currentHand.findIndex(hCard => targetFaceUp.some(tc => tc.id === hCard.id));
        if (swapPartnerIndex !== -1) {
          const handCard = currentHand[swapPartnerIndex];
          swaps.push({ handCard, faceUpCard });
          // Update local arrays for next iteration
          currentHand[swapPartnerIndex] = faceUpCard;
          currentFaceUp[i] = handCard;
        }
      }
    }

    return { swaps };
  }

  /**
   * AI Play Decision Logic:
   * Choose best valid card group to play, or return null if must pick up pile.
   */
  decideMove(availableCards, pile, gamePhase) {
    const validMoves = this.rules.getValidMoves(availableCards, pile);

    if (validMoves.length === 0) {
      return null; // Must pick up pile!
    }

    if (this.difficulty === 'easy') {
      // Pick random valid move
      const randomIndex = Math.floor(Math.random() * validMoves.length);
      return validMoves[randomIndex];
    }

    const pileSize = pile ? pile.length : 0;
    const effectiveTopCard = this.rules.getEffectiveTopCard(pile);

    if (this.difficulty === 'medium') {
      // Prefer playing multiples over single
      // Prefer playing lowest non-special cards (3-9) first, saving 2 and 10 for emergency or large piles
      validMoves.sort((a, b) => {
        const aIsSpecial = (a[0].rank === '2' || a[0].rank === '10');
        const bIsSpecial = (b[0].rank === '2' || b[0].rank === '10');

        if (aIsSpecial !== bIsSpecial) {
          return aIsSpecial ? 1 : -1; // Non-specials first
        }
        // If both non-special, play lowest value
        if (a[0].value !== b[0].value) {
          return a[0].value - b[0].value;
        }
        // If same value, play group with more cards first
        return b.length - a.length;
      });

      return validMoves[0];
    }

    // --- HARD AI STRATEGY ---
    // 1. If pile is large (>= 4 cards), try to burn with 10 or 4-of-a-kind if available!
    if (pileSize >= 4) {
      const burn10Move = validMoves.find(m => m[0].rank === '10');
      if (burn10Move) return burn10Move;

      const reset2Move = validMoves.find(m => m[0].rank === '2');
      if (reset2Move) return reset2Move;
    }

    // 2. Check if we can trigger a 4-of-a-kind burn with current pile
    if (pile && pile.length > 0) {
      const topRank = pile[pile.length - 1].rank;
      let existingCount = 0;
      for (let i = pile.length - 1; i >= 0; i--) {
        if (pile[i].rank === topRank) existingCount++;
        else break;
      }
      const needed = 4 - existingCount;
      if (needed > 0 && needed <= 3) {
        const matchingMove = validMoves.find(m => m[0].rank === topRank && m.length >= needed);
        if (matchingMove) return matchingMove;
      }
    }

    // 3. If effective top card is 7 (must play <= 7), play highest valid <= 7 card
    if (effectiveTopCard && effectiveTopCard.rank === '7') {
      const lowerMoves = validMoves.filter(m => m[0].value <= 7);
      if (lowerMoves.length > 0) {
        lowerMoves.sort((a, b) => b[0].value - a[0].value); // Highest <= 7 first
        return lowerMoves[0];
      }
    }

    // 4. Otherwise, sort moves strategically:
    //    - Non-special cards sorted by value ascending (play lowest non-special first)
    //    - Prefer playing larger sets of identical ranks
    //    - Save 2 and 10 as absolute last resort unless pile is big
    validMoves.sort((a, b) => {
      const rankA = a[0].rank;
      const rankB = b[0].rank;

      const getTier = (move) => {
        const rank = move[0].rank;
        if (rank === '10') return pileSize > 3 ? 1 : 5; // Use 10 if pile is big
        if (rank === '2') return pileSize > 3 ? 2 : 4;  // Use 2 if pile is big
        if (rank === '7') return 3;
        if (rank === '8') return 3;
        return 0; // Standard cards 3,4,5,6,9,J,Q,K,A
      };

      const tierA = getTier(a);
      const tierB = getTier(b);

      if (tierA !== tierB) return tierA - tierB;

      // Same tier: play lowest card value
      if (a[0].value !== b[0].value) {
        return a[0].value - b[0].value;
      }

      // Same rank value: play larger quantity at once
      return b.length - a.length;
    });

    return validMoves[0];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AI;
}
