import { Client, Room } from "colyseus.js"
import firebase from "firebase/compat/app"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"
import { toast } from "react-toastify"
import { getFreeSpaceOnBench } from "../../../utils/board"
import { IUserMetadata } from "../../../models/mongo-models/user-metadata"
import AfterGameState from "../../../rooms/states/after-game-state"
import GameState from "../../../rooms/states/game-state"
import {
  IBoardEvent,
  IDps,
  IDpsHeal,
  IDragDropCombineMessage,
  IDragDropItemMessage,
  IDragDropMessage,
  IPlayer,
  ISimplePlayer,
  NonFunctionPropNames,
  Role,
  Transfer
} from "../../../types"
import { RequiredStageLevelForXpElligibility } from "../../../types/Config"
import { PokemonActionState } from "../../../types/enum/Game"
import { Pkm } from "../../../types/enum/Pokemon"
import { getRankLabel } from "../../../types/strings/Strings"
import { logger } from "../../../utils/logger"
import { addWanderingPokemon } from "../game/components/pokemon"
import GameContainer from "../game/game-container"
import GameScene from "../game/scenes/game-scene"
import { useAppDispatch, useAppSelector } from "../hooks"
import {
  addBlueDpsMeter,
  addBlueHealDpsMeter,
  addPlayer,
  addRedDpsMeter,
  addRedHealDpsMeter,
  changeBlueDpsMeter,
  changeBlueHealDpsMeter,
  changePlayer,
  changeRedDpsMeter,
  changeRedHealDpsMeter,
  leaveGame,
  removeBlueDpsMeter,
  removeBlueHealDpsMeter,
  removePlayer,
  removeRedDpsMeter,
  removeRedHealDpsMeter,
  setAdditionalPokemons,
  setBoardSize,
  setCurrentPlayerAvatar,
  setCurrentPlayerMoney,
  setCurrentPlayerName,
  setCurrentPlayerTitle,
  setExperienceManager,
  setInterest,
  setItemsProposition,
  setLife,
  setLoadingProgress,
  setMapName,
  setMoney,
  setNoELO,
  setOpponentAvatar,
  setOpponentId,
  setOpponentName,
  setOpponentTitle,
  setPhase,
  setPlayer,
  setPlayerExperienceManager,
  setPokemonCollection,
  setPokemonProposition,
  setRoundTime,
  setShop,
  setShopLocked,
  setSimulation,
  setStageLevel,
  setStreak,
  setSynergies,
  setWeather
} from "../stores/GameStore"
import {
  joinGame,
  logIn,
  requestTilemap,
  setProfile
} from "../stores/NetworkStore"
import GameDpsMeter from "./component/game/game-dps-meter"
import GameItemsProposition from "./component/game/game-items-proposition"
import GameLoadingScreen from "./component/game/game-loading-screen"
import GameModal from "./component/game/game-modal"
import GamePlayers from "./component/game/game-players"
import GamePokemonsProposition from "./component/game/game-pokemons-proposition"
import GameShop from "./component/game/game-shop"
import GameStageInfo from "./component/game/game-stage-info"
import GameSynergies from "./component/game/game-synergies"
import GameToasts from "./component/game/game-toasts"
import { MainSidebar } from "./component/main-sidebar/main-sidebar"
import { LocalStoreKeys, localStore } from "./utils/store"
import { FIREBASE_CONFIG } from "./utils/utils"

let gameContainer: GameContainer

export function getGameContainer(): GameContainer {
  return gameContainer
}

export function getGameScene(): GameScene | undefined {
  return gameContainer?.game?.scene?.getScene<GameScene>("gameScene")
}

export default function Game() {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const client: Client = useAppSelector((state) => state.network.client)
  const room: Room<GameState> | undefined = useAppSelector(
    (state) => state.network.game
  )
  const uid: string = useAppSelector((state) => state.network.uid)
  const currentPlayerId: string = useAppSelector(
    (state) => state.game.currentPlayerId
  )
  const currentPlayer = useAppSelector((state) =>
    state.game.players.find((p) => p.id === state.game.currentPlayerId)
  )
  const spectate = currentPlayerId !== uid || !currentPlayer?.alive

  const initialized = useRef<boolean>(false)
  const connecting = useRef<boolean>(false)
  const connected = useRef<boolean>(false)
  const [loaded, setLoaded] = useState<boolean>(false)
  const [connectError, setConnectError] = useState<string>("")
  const [modalTitle, setModalTitle] = useState<string>("")
  const [modalInfo, setModalInfo] = useState<string>("")
  const [modalVisible, setModalVisible] = useState<boolean>(false)
  const [toAfter, setToAfter] = useState<boolean>(false)
  const [toAuth, setToAuth] = useState<boolean>(false)
  const container = useRef<HTMLDivElement>(null)

  const MAX_ATTEMPS_RECONNECT = 3

  const connectToGame = useCallback(
    async (attempts = 1) => {
      logger.debug(
        `connectToGame attempt ${attempts} / ${MAX_ATTEMPS_RECONNECT}`
      )
      const cachedReconnectionToken = localStore.get(
        LocalStoreKeys.RECONNECTION_TOKEN
      )
      if (cachedReconnectionToken) {
        connecting.current = true
        const statusMessage = document.querySelector("#status-message")
        if (statusMessage) {
          statusMessage.textContent = `Connecting to game...`
        }

        client
          .reconnect(cachedReconnectionToken)
          .then((room: Room) => {
            // store game token for 1 hour
            localStore.set(
              LocalStoreKeys.RECONNECTION_TOKEN,
              room.reconnectionToken,
              60 * 60
            )
            dispatch(joinGame(room))
            connected.current = true
            connecting.current = false
          })
          .catch((error) => {
            if (attempts < MAX_ATTEMPS_RECONNECT) {
              setTimeout(async () => await connectToGame(attempts + 1), 1000)
            } else {
              let connectError = error.message
              if (error.code === 4212) {
                // room disposed
                connectError = "This game does no longer exist"
              }
              //TODO: handle more known error codes with informative messages
              setConnectError(connectError)
              logger.error("reconnect error", error)
            }
          })
      } else {
        setToAuth(true) // no reconnection token
      }
    },
    [client, dispatch]
  )

  function playerClick(id: string) {
    gameContainer.onPlayerClick(id)

    if (room?.state?.players) {
      const player = room?.state?.players.get(id)
      if (player) {
        dispatch(setPlayer(player))
        const simulation = room?.state?.simulations.get(player.simulationId)
        if (simulation) {
          dispatch(setSimulation(simulation))
        }
      }
    }
  }

  const leave = useCallback(async () => {
    const savedPlayers = new Array<ISimplePlayer>()

    const token = await firebase.auth().currentUser?.getIdToken()

    if (gameContainer && gameContainer.game) {
      gameContainer.game.destroy(true)
    }

    const nbPlayers = room?.state.players.size ?? 0

    if (nbPlayers > 0) {
      room?.state.players.forEach((player) =>
        savedPlayers.push(gameContainer.transformToSimplePlayer(player))
      )
    }

    const elligibleToXP =
      nbPlayers >= 2 &&
      (room?.state.stageLevel ?? 0) >= RequiredStageLevelForXpElligibility
    const elligibleToELO =
      elligibleToXP &&
      !room?.state.noElo &&
      savedPlayers.filter((p) => p.role !== Role.BOT).length >= 2

    const r: Room<AfterGameState> = await client.create("after-game", {
      players: savedPlayers,
      idToken: token,
      elligibleToXP,
      elligibleToELO
    })
    localStore.set(LocalStoreKeys.RECONNECTION_TOKEN, r.reconnectionToken, 30)
    r.connection.close()
    dispatch(leaveGame())
    setToAfter(true)

    try {
      await room?.leave()
    } catch (error) {
      logger.warn("Room already closed")
    }
  }, [client, dispatch, room])

  useEffect(() => {
    const connect = () => {
      logger.debug("connecting to game")
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG)
      }

      firebase.auth().onAuthStateChanged(async (user) => {
        if (user && !connecting.current) {
          connecting.current = true
          dispatch(logIn(user))
          await connectToGame()
        }
      })
    }

    if (!connected.current) {
      connect()
    } else if (
      !initialized.current &&
      room != undefined &&
      container?.current
    ) {
      logger.debug("initializing game")
      initialized.current = true
      dispatch(requestTilemap())
      gameContainer = new GameContainer(container.current, uid, room)
      document.getElementById("game")?.addEventListener(Transfer.DRAG_DROP, ((
        event: CustomEvent<IDragDropMessage>
      ) => {
        gameContainer.onDragDrop(event)
      }) as EventListener)
      document
        .getElementById("game")
        ?.addEventListener(Transfer.DRAG_DROP_ITEM, ((
          event: CustomEvent<IDragDropItemMessage>
        ) => {
          gameContainer.onDragDropItem(event)
        }) as EventListener)
      document
        .getElementById("game")
        ?.addEventListener(Transfer.DRAG_DROP_COMBINE, ((
          event: CustomEvent<IDragDropCombineMessage>
        ) => {
          gameContainer.onDragDropCombine(event)
        }) as EventListener)
      document.getElementById("game")?.addEventListener(Transfer.SELL_DROP, ((
        event: CustomEvent<{ pokemonId: string }>
      ) => {
        gameContainer.onSellDrop(event)
      }) as EventListener)
      room.onMessage(Transfer.LOADING_COMPLETE, () => {
        setLoaded(true)
      })
      room.onMessage(Transfer.BROADCAST_INFO, (message) => {
        setModalTitle(message.title)
        setModalInfo(message.info)
        setModalVisible(true)
      })
      room.onMessage(Transfer.REQUEST_TILEMAP, (tilemap) => {
        gameContainer.setTilemap(tilemap)
      })
      room.onMessage(Transfer.TOGGLE_ANIMATION, (message) => {
        const g = getGameScene()
        if (g && g.minigameManager.pokemons.size > 0) {
          // early return here to prevent toggling animation twice
          return g.minigameManager.changePokemon(
            message,
            "action",
            PokemonActionState.EMOTE
          )
        }

        if (g && g.board) {
          g.board.toggleAnimation(message.id, message?.emote)
        }
      })

      room.onMessage(Transfer.POKEMON_DAMAGE, (message) => {
        gameContainer.handleDisplayDamage(message)
      })

      room.onMessage(Transfer.ABILITY, (message) => {
        gameContainer.handleDisplayAbility(message)
      })

      room.onMessage(Transfer.POKEMON_HEAL, (message) => {
        gameContainer.handleDisplayHeal(message)
      })

      room.onMessage(Transfer.PLAYER_DAMAGE, (value) => {
        toast(
          <div className="toast-player-damage">
            <span style={{ verticalAlign: "middle" }}>-{value}</span>
            <img className="icon-life" src="/assets/ui/heart.png" alt="❤" />
          </div>,
          { containerId: "toast-life" }
        )
      })

      room.onMessage(Transfer.PLAYER_INCOME, (value) => {
        toast(
          <div className="toast-player-income">
            <span style={{ verticalAlign: "middle" }}>+{value}</span>
            <img className="icon-money" src="/assets/icons/money.svg" alt="$" />
          </div>,
          { containerId: "toast-money" }
        )
      })

      room.onMessage(Transfer.UNOWN_WANDERING, () => {
        if (gameContainer.game) {
          const g = getGameScene()
          if (g && g.unownManager) {
            g.unownManager.addWanderingUnown()
          }
        }
      })

      room.onMessage(Transfer.POKEMON_WANDERING, (pokemon: Pkm) => {
        const scene = getGameScene()
        if (scene) {
          addWanderingPokemon(scene, pokemon, (sprite, pointer, tween) => {
            if (
              scene.board &&
              getFreeSpaceOnBench(scene.board.player.board) > 0
            ) {
              room.send(Transfer.POKEMON_WANDERING, pokemon)
              sprite.destroy()
              tween.destroy()
            } else if (scene.board) {
              scene.board.displayText(pointer.x, pointer.y, t("full"))
            }
          })
        }
      })

      room.onMessage(Transfer.BOARD_EVENT, (event: IBoardEvent) => {
        if (gameContainer.game) {
          const g = getGameScene()
          if (g?.battle?.simulation?.id === event.simulationId) {
            g.battle.displayBoardEvent(event)
          }
        }
      })

      room.onMessage(Transfer.SIMULATION_STOP, () => {
        if (gameContainer.game) {
          const g = getGameScene()
          if (g && g.battle) {
            g.battle.clear()
          }
        }
      })

      room.onMessage(Transfer.GAME_END, leave)

      room.onMessage(Transfer.USER_PROFILE, (user: IUserMetadata) => {
        dispatch(setProfile(user))
      })

      room.state.listen("roundTime", (value) => {
        dispatch(setRoundTime(value))
      })

      room.state.listen("phase", (value) => {
        if (gameContainer.game) {
          const g = getGameScene()
          if (g) {
            g.updatePhase()
          }
        }
        dispatch(setPhase(value))
      })

      room.state.listen("stageLevel", (value) => {
        dispatch(setStageLevel(value))
      })

      room.state.listen("mapName", (value) => {
        dispatch(setMapName(value))
      })

      room.state.listen("noElo", (value) => {
        dispatch(setNoELO(value))
      })

      room.state.additionalPokemons.onAdd(() => {
        dispatch(setAdditionalPokemons(room.state.additionalPokemons))
      })

      room.state.simulations.onRemove(() => {
        gameContainer.resetSimulation()
      })

      room.state.simulations.onAdd((simulation) => {
        gameContainer.initializeSimulation(simulation)
        dispatch(setSimulation(simulation))

        simulation.listen("weather", (value) => {
          dispatch(setWeather({ id: simulation.id, value: value }))
        })

        simulation.blueDpsMeter.onAdd((dps) => {
          dispatch(addBlueDpsMeter({ value: dps, id: simulation.id }))
          const fields: NonFunctionPropNames<IDps>[] = [
            "id",
            "name",
            "physicalDamage",
            "specialDamage",
            "trueDamage"
          ]
          fields.forEach((field) => {
            dps.listen(field, (value) => {
              dispatch(
                changeBlueDpsMeter({
                  id: dps.id,
                  field: field,
                  value: value,
                  simulationId: simulation.id
                })
              )
            })
          })
        })

        simulation.blueDpsMeter.onRemove(() => {
          dispatch(removeBlueDpsMeter(simulation.id))
        })

        simulation.redDpsMeter.onAdd((dps) => {
          dispatch(addRedDpsMeter({ value: dps, id: simulation.id }))
          const fields: NonFunctionPropNames<IDps>[] = [
            "id",
            "name",
            "physicalDamage",
            "specialDamage",
            "trueDamage"
          ]
          fields.forEach((field) => {
            dps.listen(field, (value) => {
              dispatch(
                changeRedDpsMeter({
                  id: dps.id,
                  field: field,
                  value: value,
                  simulationId: simulation.id
                })
              )
            })
          })
        })
        simulation.redDpsMeter.onRemove(() => {
          dispatch(removeRedDpsMeter(simulation.id))
        })

        simulation.blueHealDpsMeter.onAdd((dps) => {
          dispatch(addBlueHealDpsMeter({ value: dps, id: simulation.id }))
          const fields: NonFunctionPropNames<IDpsHeal>[] = [
            "heal",
            "id",
            "name",
            "shield"
          ]

          fields.forEach((field) => {
            dps.listen(field, (value) => {
              dispatch(
                changeBlueHealDpsMeter({
                  id: dps.id,
                  field: field,
                  value: value,
                  simulationId: simulation.id
                })
              )
            })
          })
        })
        simulation.blueHealDpsMeter.onRemove(() => {
          dispatch(removeBlueHealDpsMeter(simulation.id))
        })

        simulation.redHealDpsMeter.onAdd((dps) => {
          dispatch(addRedHealDpsMeter({ value: dps, id: simulation.id }))
          const fields: NonFunctionPropNames<IDpsHeal>[] = [
            "heal",
            "id",
            "name",
            "shield"
          ]

          fields.forEach((field) => {
            dps.listen(field, (value) => {
              dispatch(
                changeRedHealDpsMeter({
                  id: dps.id,
                  field: field,
                  value: value,
                  simulationId: simulation.id
                })
              )
            })
          })
        })
        simulation.redHealDpsMeter.onRemove(() => {
          dispatch(removeRedHealDpsMeter(simulation.id))
        })
      })

      room.state.players.onAdd((player) => {
        gameContainer.initializePlayer(player)
        dispatch(addPlayer(player))

        if (player.id == uid) {
          dispatch(setInterest(player.interest))
          dispatch(setStreak(player.streak))
          dispatch(setShopLocked(player.shopLocked))
          dispatch(setPokemonCollection(player.pokemonCollection))
          dispatch(setPlayer(player))

          player.listen("alive", (value) => {
            const rankPhrase = getRankLabel(player.rank)!
            const titlePhrase = "Game Over"
            if (value === false) {
              setModalTitle(titlePhrase)
              setModalInfo(rankPhrase)
              setModalVisible(true)
            }
          })
          player.listen("interest", (value) => {
            dispatch(setInterest(value))
          })
          player.listen("shop", (value) => {
            dispatch(setShop(value))
          })
          player.listen("shopLocked", (value) => {
            dispatch(setShopLocked(value))
          })
          player.listen("money", (value) => {
            dispatch(setMoney(value))
          })
          player.listen("streak", (value) => {
            dispatch(setStreak(value))
          })
        }

        player.listen("opponentId", (value) => {
          dispatch(setOpponentId({ id: player.id, value: value }))
        })
        player.listen("opponentName", (value) => {
          dispatch(setOpponentName({ id: player.id, value: value }))
        })
        player.listen("opponentAvatar", (value) => {
          dispatch(setOpponentAvatar({ id: player.id, value: value }))
        })
        player.listen("opponentTitle", (value) => {
          dispatch(setOpponentTitle({ id: player.id, value: value }))
        })
        player.listen("boardSize", (value) => {
          dispatch(setBoardSize({ id: player.id, value: value }))
        })
        player.listen("life", (value) => {
          dispatch(setLife({ id: player.id, value: value }))
        })
        player.listen("money", (value) => {
          dispatch(setCurrentPlayerMoney({ id: player.id, value: value }))
        })
        player.listen("experienceManager", (value) => {
          if (player.id === uid) {
            dispatch(setExperienceManager(value))
          }
          dispatch(
            setPlayerExperienceManager({
              id: player.id,
              value: value
            })
          )
        })
        player.listen("avatar", (value) => {
          dispatch(setCurrentPlayerAvatar({ id: player.id, value: value }))
        })
        player.listen("name", (value) => {
          dispatch(setCurrentPlayerName({ id: player.id, value: value }))
        })
        player.listen("title", (value) => {
          dispatch(setCurrentPlayerTitle({ id: player.id, value: value }))
        })
        player.listen("loadingProgress", (value) => {
          dispatch(setLoadingProgress({ id: player.id, value: value }))
        })

        const fields: NonFunctionPropNames<IPlayer>[] = [
          "money",
          "history",
          "life",
          "rank"
        ]

        fields.forEach((field) => {
          player.listen(field, (value) => {
            dispatch(
              changePlayer({ id: player.id, field: field, value: value })
            )
          })
        })

        player.synergies.onChange(() => {
          dispatch(setSynergies({ id: player.id, value: player.synergies }))
        })

        player.itemsProposition.onAdd(() => {
          if (player.id == uid) {
            dispatch(setItemsProposition(player.itemsProposition))
          }
        })
        player.itemsProposition.onRemove(() => {
          if (player.id == uid) {
            dispatch(setItemsProposition(player.itemsProposition))
          }
        })

        player.pokemonsProposition.onAdd(() => {
          if (player.id == uid) {
            dispatch(setPokemonProposition(player.pokemonsProposition))
          }
        })
        player.pokemonsProposition.onRemove(() => {
          if (player.id == uid) {
            dispatch(setPokemonProposition(player.pokemonsProposition))
          }
        })
      })

      room.state.players.onRemove((player) => {
        dispatch(removePlayer(player))
      })

      room.state.spectators.onAdd((uid) => {
        gameContainer.initializeSpectactor(uid)
      })
    }
  }, [
    connected,
    connecting,
    initialized,
    room,
    dispatch,
    client,
    uid,
    currentPlayerId,
    connectToGame,
    leave
  ])

  if (toAuth) {
    return <Navigate to={"/"} />
  }

  if (toAfter) {
    return <Navigate to="/after" />
  }

  return (
    <div id="game-wrapper">
      {loaded ? (
        <>
          <MainSidebar page="game" leave={leave} leaveLabel={t("leave_game")} />
          <GameModal
            visible={modalVisible}
            modalTitle={modalTitle}
            modalInfo={modalInfo}
            hideModal={setModalVisible}
            leave={leave}
          />
          {!spectate && <GameShop />}
          <GameStageInfo />
          <GamePlayers click={(id: string) => playerClick(id)} />
          <GameSynergies />
          <GameItemsProposition />
          <GamePokemonsProposition />
          <GameDpsMeter />
          <GameToasts />
        </>
      ) : (
        <GameLoadingScreen connectError={connectError} />
      )}
      <div id="game" ref={container}></div>
    </div>
  )
}
