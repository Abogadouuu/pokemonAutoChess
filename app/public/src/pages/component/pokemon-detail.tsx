import React from 'react';
import PokemonFactory from '../../../../models/pokemon-factory';
import {RARITY_COLOR, SPECIAL_SKILL_DESCRIPTION, CDN_URL} from '../../../../models/enum';
import { Convert } from '../../../../types/ITracker';
import tracker from '../../../../public/dist/client/assets/pokemons/tracker.json';
import { Emotion } from '../../../../types';
const metadata = Convert.toITracker(JSON.stringify(tracker));

export default function PokemonDetail(props:{pokemon: string}) {
    const pokemon = PokemonFactory.createPokemonFromName(props.pokemon);
    let m;
    const pathIndex = pokemon.index.split('-');
    if(pathIndex.length == 1){
        m = metadata[pokemon.index];
    }
    else if(pathIndex.length == 2){
        m = metadata[pathIndex[0]].subgroups[pathIndex[1]];
    }
    if(m){
        return (            
            <div style={{display: 'flex'}}>
                <div style={{width: '30%'}}>
                    <p>name:{pokemon.name}</p>
                    <p>Portrait Credit:</p>
                    <ul>
                        <li><p>{m.portrait_credit.primary}</p></li>
                        <li><p>{m.portrait_credit.secondary}</p></li>
                    </ul>
                    <p>Sprite Credit:</p>
                    <ul>
                        <li><p>{m.sprite_credit.primary}</p></li>
                        <li><p>{m.sprite_credit.secondary}</p></li>
                    </ul>
                    <p style={{color:RARITY_COLOR[pokemon.rarity]}}>rarity:{pokemon.rarity}</p>
                    <div>
                        types:{pokemon.types.map(type=>{
                            return <img key={'img'+type} src={'assets/types/'+type+'.png'}/>
                        })}
                    </div>
                    <div>evolution: {pokemon.evolution == ''? 'No evolution': <img src={`${CDN_URL}${PokemonFactory.createPokemonFromName(pokemon.evolution).index.replace('-','/')}/${Emotion.NORMAL}.png`}/>}</div>
                </div>
                <div style={{width: '30%'}}>
                    <p>Health: {pokemon.hp}</p>
                    <p>Attack: {pokemon.atk}</p>
                    <p>Defense: {pokemon.def}</p>
                    <p>Special Defense: {pokemon.speDef}</p>
                    <p>Range: {pokemon.range}</p>
                    <p>Mana: {pokemon.maxMana}</p>
                </div>
                <div style={{width: '30%'}}>
                    <p>Ability: {SPECIAL_SKILL_DESCRIPTION[pokemon.skill].title.eng}</p>
                    <p>Description:{SPECIAL_SKILL_DESCRIPTION[pokemon.skill].description.eng}</p>
                </div>
            </div>
        )
    }
    else{
        return null;
    }
}