import React from "react"
import { useTranslation } from "react-i18next"
import { PRECOMPUTED_EMOTIONS_PER_POKEMON_INDEX } from "../../../../../../app/models/precomputed"
import PokemonFactory from "../../../../../models/pokemon-factory"
import { Emotion, PkmWithConfig } from "../../../../../types"
import { Item } from "../../../../../types/enum/Item"
import { Pkm } from "../../../../../types/enum/Pokemon"
import { ItemDetailTooltip } from "../../../game/components/item-detail"
import { Checkbox } from "../checkbox/checkbox"
import { GamePokemonDetail } from "../game/game-pokemon-detail"

export default function SelectedEntity(props: {
  entity: Item | PkmWithConfig
  onChange: (pkm: PkmWithConfig) => void
}) {
  const { t } = useTranslation()
  if (Object.keys(Item).includes(props.entity as Item)) {
    return (
      <div id="selected-entity" className="nes-container">
        <ItemDetailTooltip item={props.entity as Item} />
      </div>
    )
  } else if (
    Object.values(Pkm).includes((props.entity as PkmWithConfig).name)
  ) {
    const detailledPkm = props.entity as PkmWithConfig
    const pokemon = PokemonFactory.createPokemonFromName(detailledPkm.name, {
      selectedEmotion: detailledPkm.emotion,
      selectedShiny: detailledPkm.shiny
    })
    const availableEmotions: Emotion[] = Object.values(Emotion).filter(
      (e, i) => PRECOMPUTED_EMOTIONS_PER_POKEMON_INDEX[pokemon.index]?.[i] === 1
    )

    return (
      <div id="selected-entity" className="nes-container">
        <fieldset>
          <Checkbox
            checked={Boolean(detailledPkm.shiny)}
            onToggle={() => {
              props.onChange({
                ...detailledPkm,
                shiny: !detailledPkm.shiny
              })
            }}
            label={t("shiny")}
            isDark
          />
          <label>
            {t("emotion_label")}:
            <select
              value={detailledPkm.emotion}
              onChange={(e) => {
                props.onChange({
                  ...detailledPkm,
                  emotion: e.target.value as Emotion
                })
              }}
            >
              {availableEmotions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <GamePokemonDetail
          pokemon={PokemonFactory.createPokemonFromName(detailledPkm.name)}
          emotion={detailledPkm.emotion}
          shiny={detailledPkm.shiny}
        />
      </div>
    )
  } else {
    return null
  }
}
