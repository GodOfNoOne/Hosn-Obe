import { useEffect, useMemo, useReducer } from "react"

import { handScore, viewFor } from "@hosn-obe/shared"

import type { RoomCommands } from "./commands.js"
import { Game, type TrainingGuide } from "./Game.js"
import {
  createTutorial, isBotStep, stepTutorial, tutorialRoom,
  type TutorialStep,
} from "./trainer.js"

const lessons: Record<TutorialStep, { title: string; text: string; task: string; progress: number; guide?: TrainingGuide }> = {
  keep: {
    title: "Let’s play a hand",
    text: "You have 3 lives. Build a strong hand to avoid losing them. Only cards of the same suit add together: your A♥ (11) + K♥ (10) = 21. The 7♣ doesn’t add to your hearts.",
    task: "You open this round. Tap Keep to hold these cards.", progress: 1,
    guide: { action: "KEEP" },
  },
  openingBots: {
    title: "Around the table",
    text: "Keeping reveals the table cards. Mia and Leo take their turns before you. Face-up trades are visible; the blue cards stay hidden.",
    task: "Watch the other players make their moves.", progress: 2,
  },
  swap: {
    title: "Turn 21 into 30",
    text: "The 9♥ on the table fits your hearts. Trade away your 7♣, and all three cards will count toward your score.",
    task: "Tap your 7♣, tap the table’s 9♥, then tap Swap.", progress: 2,
    guide: { handIdx: 2, pool: "up", poolIdx: 0, action: "SWAP" },
  },
  swapBots: {
    title: "That’s 30 points!",
    text: "A♥ + K♥ + 9♥ = 30. Your old card is now on the table, where another player can take it.",
    task: "Mia and Leo are taking their turns.", progress: 3,
  },
  knock: {
    title: "Close the round",
    text: "30 is a strong hand. Knock when you’re ready to compare scores. Each other player gets one final move before the cards are revealed.",
    task: "Tap Knock to close this round.", progress: 3,
    guide: { action: "KNOCK" },
  },
  finalBots: {
    title: "One last chance",
    text: "After a knock, the others can swap or Stand. Mia and Leo are standing: they keep their hands and finish their turns.",
    task: "Watch the last turns, then compare the scores.", progress: 3,
  },
  roundResult: {
    title: "You kept all your lives",
    text: "You scored 30, Leo scored 20, and Mia scored 17. Mia has the lowest hand and loses a life. At zero lives you’re swimming; lose again and you’re out. The last player remaining wins the game.",
    task: "Let’s play another round and try a different kind of swap.", progress: 4,
  },
  secondOpening: {
    title: "A fresh deal",
    text: "The opening player changes each round. Mia opens this one and keeps her cards. Your lives carry over, but everyone gets a new hand.",
    task: "Wait for your turn. There’s no time limit in this trainer.", progress: 4,
  },
  allThree: {
    title: "Try the hidden set",
    text: "This mixed hand scores just 11. You can exchange all three cards with either pool. A face-down swap is a gamble: you won’t know what you’ve taken until the trade.",
    task: "Tap All 3 above the face-down pool, then tap Swap.", progress: 4,
    guide: { pool: "down", all: true, action: "SWAP_ALL" },
  },
  allThreeBots: {
    title: "A promising draw",
    text: "You drew A♠, K♠, and 8♦. Your two spades score 21. One more spade could give you a winning hand.",
    task: "Let the other players finish their turns.", progress: 5,
  },
  fireSwap: {
    title: "Find the winning card",
    text: "The Q♠ is worth 10. Add it to your A♠ (11) and K♠ (10), and you reach 31 — also called fire.",
    task: "Tap your 8♦, tap the table’s Q♠, then tap Swap.", progress: 5,
    guide: { handIdx: 2, pool: "up", poolIdx: 0, action: "SWAP" },
  },
  layDown: {
    title: "31! Lay down now",
    text: "31 ends the round immediately when you lay down. You can do this even on someone else’s turn. In a real game, waiting too long or making another move costs you a life.",
    task: "Tap Lay down! to reveal your winning hand.", progress: 6,
    guide: { action: "LAY_DOWN" },
  },
  complete: {
    title: "You’ve got the basics",
    text: "You swapped one card, traded a whole hand, knocked, and laid down 31. Three of a kind scores 30½; three Aces score 33 and make everyone else lose a life when you lay down.",
    task: "Ready to try a table without hints? Play a practice game against bots.", progress: 6,
  },
}

export function Tutorial({ onClose, onPractice }: { onClose: () => void; onPractice: () => void }) {
  const [state, dispatch] = useReducer(stepTutorial, undefined, createTutorial)
  const lesson = lessons[state.step]
  const botTurn = isBotStep(state.step)

  // Only opponents have timers. Every learner action waits as long as needed.
  useEffect(() => {
    if (!botTurn) return
    const timer = setTimeout(() => dispatch({ type: "bot" }), 1300)
    return () => clearTimeout(timer)
  }, [botTurn, state.game.seq, state.step])

  const commands = useMemo<RoomCommands>(() => ({
    setReady() {}, setMaxPlayers() {}, addBot() {}, removeBot() {},
    setBotLevel() {}, kick() {}, start() {}, returnToLobby() {},
    act: (action) => dispatch({ type: "act", action }),
  }), [])
  const view = viewFor(state.game, 0)
  const score = handScore(state.game.players[0]!.hand)

  return (
    <section className="trainer" aria-label="Guided demo game">
      <div className="trainer-header">
        <button type="button" className="secondary btn-small" onClick={onClose}>Exit tutorial</button>
        <span>DEMO GAME · ROUND {state.game.round}</span>
        <button type="button" className="secondary btn-small" onClick={() => dispatch({ type: "restart" })}>Restart</button>
      </div>

      <div className="trainer-coach panel" aria-live="polite" aria-atomic="true">
        <p className="trainer-count">LEARN BY PLAYING · {lesson.progress} / 6</p>
        <h2>{lesson.title}</h2>
        <p>{lesson.text}</p>
        <p className="trainer-task">{state.feedback ?? lesson.task}</p>
        <div className="trainer-progress" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={index < lesson.progress ? "active" : ""} />
          ))}
        </div>
        {state.step === "roundResult" && (
          <button type="button" onClick={() => dispatch({ type: "nextRound" })}>Play the next round</button>
        )}
        {state.step === "complete" && (
          <button type="button" onClick={onPractice}>Practice against bots</button>
        )}
      </div>

      <div className="trainer-score">
        <span>Your best suit: <strong>{score} points</strong></span>
        <span>{botTurn ? "Opponents’ turn" : "Take your time"}</span>
      </div>
      <Game
        view={view}
        room={tutorialRoom}
        isHost={false}
        commands={commands}
        onLeave={onClose}
        training={{
          ...lesson.guide,
          status: state.step === "roundResult"
            ? "Round complete — continue when ready."
            : state.step === "complete" ? "Training complete." : undefined,
        }}
      />
    </section>
  )
}
