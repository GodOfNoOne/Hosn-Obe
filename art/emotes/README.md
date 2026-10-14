# Card emote artwork

Original raster card characters generated with the built-in imagegen tool.
The game displays PNG thumbnails in the picker and real transparent GIFs for reactions.
Reduced-motion users see still images. Each GIF contains sixteen frames, lasts
2.4 seconds and loops. Reactions disappear after the existing 2.5-second lifetime.

The source sheets contain eight poses in a 4 by 2 grid. Re-export with Pillow:

```sh
python scripts/build_emote_gifs.py art/emotes client/src/assets/emotes
```

Replace GIF and PNG assets to change an emote; no drawing or animation code
needs to change in React. Source sheets remain outside the client bundle.

## Generation prompts

Create an animation sprite sheet for an original mobile card-game reaction emote. EXACTLY eight frames arranged in a precise 4-column x 2-row grid of equal square cells, ordered left to right then top row to bottom row. Every cell contains the SAME full cream-colored playing card character with thick dark navy cartoon outlines, softly shaded golden edges, rounded corners, tiny suit symbols in opposite corners, and a large expressive face. No arms or legs. Charming polished cartoon game-sticker artwork, bold and readable at 100px. Same card proportions, scale, camera, and centered position in ALL eight frames, entire card visible with 15% padding inside each cell. Genuinely transparent background, no grid lines, no captions or frame numbers, no shadows outside the character. Create successive animation poses, not unrelated designs. Frames must form a seamless continuous loop, last pose returns toward first. 

### laughing

Club corner symbols. Laughing uncontrollably with shut chevron eyes, pink blush, a huge open mouth showing white teeth and pink tongue. Animate a belly laugh: open mouth expands and contracts, cheeks and eyes squash, card gently bends and bounces in successive poses.

### angry

Red diamond corner symbols. Furious eyebrows, narrowed eyes, clenched white teeth, red blush. Animate a frustrated huff: card squeezes and shakes, brows lower then relax a little, little white steam puffs appear at sides then rise and dissipate across frames.

### crying

Spade corner symbols. Sad raised brows, squeezed eyes, open trembling frown. Animate sobbing: mouth trembles and cheeks squeeze, large bright cyan tears emerge from eyes, fall down cheeks and drop away across successive frames then reset.

### gg

Red heart corner symbols. Friendly happy eyes and warm smile. A mint-green rounded badge with EXACT lettering 'GG' sits across the lower card. Animate a happy victory nod: card bobs and tilts slightly, smile widens then eases, small golden star sparkles twinkle around it. Maintain clearly readable GG in every frame.


