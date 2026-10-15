# Card emote artwork

The current designs are original SVG playing-card characters in
`client/src/CardEmoteArtwork.tsx`, with motion in `client/src/emotes.css`.
They share a bright white card face, a slim cool gray edge, navy linework,
and real corner ranks and suits. The vector art stays sharp at any display size.

Each reaction animates its own parts directly:

- Laughing: two small laugh bounces, with a changing mouth opening.
- Angry: a short huff, a brow furrow, and steam that expands and fades.
- Crying: a quiet sob, a trembling mouth, and staggered falling tears.
- Good game: a gentle nod, an occasional blink, and mint/blue sparkles.

CSS interpolates the motion at the display's refresh rate. There are no generated
video frames, optical-flow morphs, palette reductions, or image export steps.
The picker shows the same artwork without motion. `prefers-reduced-motion`
disables all character animations. The existing 2.5-second reaction lifetime,
cooldown, mute control, and network events are unchanged.

Run `npm run dev:client` and open `/emote-preview.html` on the client dev server
to review all four designs, pause/replay motion, and inspect small previews
against a light background. `design-preview.png` is a static design contact sheet.

## Legacy raster artwork

The generated sheets in this directory and the GIF/PNG assets in
`client/src/assets/emotes` are retained as historical source material. They are
not imported by the current client. `scripts/build_emote_gifs.py` only exports
that legacy artwork.

### Original generation prompts (archived)

Create an animation sprite sheet for an original mobile card-game reaction emote. EXACTLY eight frames arranged in a precise 4-column x 2-row grid of equal square cells, ordered left to right then top row to bottom row. Every cell contains the SAME full cream-colored playing card character with thick dark navy cartoon outlines, softly shaded golden edges, rounded corners, tiny suit symbols in opposite corners, and a large expressive face. No arms or legs. Charming polished cartoon game-sticker artwork, bold and readable at 100px. Same card proportions, scale, camera, and centered position in ALL eight frames, entire card visible with 15% padding inside each cell. Genuinely transparent background, no grid lines, no captions or frame numbers, no shadows outside the character. Create successive animation poses, not unrelated designs. Frames must form a seamless continuous loop, last pose returns toward first. 

### laughing

Club corner symbols. Laughing uncontrollably with shut chevron eyes, pink blush, a huge open mouth showing white teeth and pink tongue. Animate a belly laugh: open mouth expands and contracts, cheeks and eyes squash, card gently bends and bounces in successive poses.

### angry

Red diamond corner symbols. Furious eyebrows, narrowed eyes, clenched white teeth, red blush. Animate a frustrated huff: card squeezes and shakes, brows lower then relax a little, little white steam puffs appear at sides then rise and dissipate across frames.

### crying

Spade corner symbols. Sad raised brows, squeezed eyes, open trembling frown. Animate sobbing: mouth trembles and cheeks squeeze, large bright cyan tears emerge from eyes, fall down cheeks and drop away across successive frames then reset.

### gg

Red heart corner symbols. Friendly happy eyes and warm smile. A mint-green rounded badge with EXACT lettering 'GG' sits across the lower card. Animate a happy victory nod: card bobs and tilts slightly, smile widens then eases, small golden star sparkles twinkle around it. Maintain clearly readable GG in every frame.


