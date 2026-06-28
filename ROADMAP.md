# Roadmap Checklist

Objectif produit : garder une petite demo locale simple, mais pousser en priorite la sensation physique du lance et la performance du rendu. La personnalisation et l'UI/UX viennent apres.

## Etat actuel

- [x] Base React + Vite + TypeScript.
- [x] Scene Three.js avec sol, lumiere studio, camera amortie legere et UI minimale.
- [x] Physique Rapier avec gravite, friction, restitution, damping et detection de face.
- [x] Drag physique par joint spherique sur le point attrape du de.
- [x] Lancer au relachement base sur les derniers echantillons souris.
- [x] Build et tests unitaires de detection de face fonctionnels.

## Priorite 1 - Realisme du lance

But : le de doit donner une impression de poids, de contact et d'inertie credibles avant toute nouvelle fonctionnalite.

- [x] Mesurer et documenter le comportement actuel avec 5 a 10 lancers manuels : court, rapide, vertical, lateral, prise par coin, prise par face.
- [x] Ajuster `src/physics/config.ts` pour obtenir une sensation plus lourde : masse, damping lineaire, damping angulaire, friction et restitution.
- [x] Remplacer progressivement le simple ajout de vitesse au drop par des impulsions Rapier appliquees au point attrape, si l'API permet un meilleur couple naturel.
- [x] Corriger le mapping du drag pour permettre des gestes avant/arriere et diagonaux en profondeur.
- [x] Ajouter des limites physiques invisibles autour du plateau pour empecher le de de tomber hors scene.
- [x] Tester une forme de collision plus proche du de arrondi : comparer cuboid actuel, round cuboid Rapier ou collider compose.
- [x] Ajouter une limite douce aux vitesses extremes pour eviter les lancers irreels sans casser les gestes rapides.
- [x] Ameliorer la stabilisation finale : seuils de repos, nombre de frames, sleep event Rapier si fiable.
- [x] Verifier que la detection de face reste fiable apres chaque changement de collider ou de rotation.
- [x] Ajouter des tests unitaires pour `getThrowVectors` : drag court, drag rapide, drag vertical et clamp de vitesse.
- [x] Documenter dans ce fichier les valeurs physiques retenues et la raison de chaque changement.

Valeurs retenues 2026-06-27 :

- Gravite verticale `[0, -38, 0]` : suppression de la derive horizontale artificielle.
- De : masse `0.62`, friction `0.96`, restitution `0.18`, damping lineaire `0.34`, damping angulaire `0.18`.
- Collider du de : `RoundCuboidCollider` Rapier, demi-extension `0.49`, rayon arrondi `0.06`, soit environ `0.55` pour un demi-de visuel de `0.56`; decision : preferable au cuboide simple pour des contacts moins carres, et plus leger qu'un collider compose.
- Sol : friction `0.92`, restitution `0.14`, collider cuboide fin `0.08` sous la surface visible pour eviter le passage a travers un plan sans epaisseur.
- Lancer : vitesse cible au point attrape, impulsion `applyImpulseAtPoint`, `pointImpulseScale` `0.88`, delta vitesse max `6.5`, impulsion max `3.2`, impulsion de poignet max `0.72`.
- Decision : le couple principal vient du point de prise et du bras de levier Rapier ; la petite impulsion de poignet ne sert qu'a eviter les lancers trop morts lors d'une prise tres centree.
- Stabilisation : vitesse lineaire `< 0.055`, vitesse angulaire `< 0.13`, `framesRequired` `44`, `stableFaceFramesRequired` `18`. Decision : ne pas utiliser `onSleep` pour le resultat final pour l'instant, car la stabilisation par seuils + face stable est deterministe, testable, et ne depend pas du timing de sommeil moteur.
- Limites invisibles : demi-plateau `7.2`, murs hauteur `5.6`, epaisseur `0.38`, plafond epaisseur `0.14`.
- Camera : position de base `[8.2, 5.6, 9.4]`, suivi amorti leger via ref mutable pour eviter des re-renders React pendant la simulation.
- Feedback mur/plafond : ripple shader localise au point de contact et aligne sur le plan de la limite touchee, duree `0.38`, rouge clair `vec3(0.95, 0.08, 0.055)` puis fondu transparent.
- Drag profondeur : le geste souris est relatif au point attrape ; axe horizontal = droite camera projetee au sol, le signe du geste vertical controle avant/arriere, et l'amplitude verticale souleve toujours le de pour eviter de tirer l'ancre dans le sol. Multiplicateurs `lateralGestureScale 0.86`, `depthGestureScale 0.78`, `verticalGestureScale 0.46`, world units par pixel bornes entre `0.006` et `0.018`.
- Monde ouvert 2026-06-27 : les murs/plafond ne sont plus montes dans la scene active. Le code du monde borne est conserve dans `src/components/worlds/BoundedWorld.tsx` pour un futur choix de type de monde. Le sol actif utilise un collider et un mesh tres larges (`halfExtent 1024`) avec texture repetee pour simuler un sol sans bord visible.
- Camera monde ouvert : suivi centre sur le de, sans clamp de plateau, zoom wheel/pinch entre `0.62` et `2.4`, et zoom-out automatique transitoire jusqu'a `2.15` quand le de part loin. Le suivi est fige pendant le drag pour ne pas perturber la prise du de, puis reprend au relachement avec rattrapage reactif borne : regard `10.5 + lag*1.05` max `34`, position `8.4 + lag*0.85` max `26`, auto-zoom des `1.45` unites de retard. Le bouton Reset remet immediatement position camera, cible de regard, zoom wheel/pinch et zoom courant a l'etat initial pour eviter de reparcourir le trajet depuis un lancer tres loin.

Micro-ajustements drop 2026-06-27 :

- Decision utilisateur : ajout d'une rangee compacte de presets `0` a `H` pour comparer directement plusieurs sensations de drop, malgre le classement initial en personnalisation plus tard. La decision reste volontairement minimale : pas de panneau, pas de stats, pas de menu complexe.
- Invariant : les presets ne modifient pas le mouvement pendant le drag. `throw`, `drag`, `settle`, collider du de et limites du plateau restent partages entre tous les profils.
- Base `0` conserve les valeurs actuelles : gravite `-38`, masse `0.62`, restitution de `0.18`, friction de `0.96`, damping lineaire `0.34`, damping angulaire `0.18`.
- Presets compares : `A` gravite plus nette (`-44`, masse `0.56`) ; `B` plus leger et vif (`-46`, masse `0.50`, restitution `0.26`) ; `C` plus roulant (friction `1.02`, damping angulaire `0.08`) ; `D` plus rebond (`-48`, restitution `0.31`) ; `E` sec et rapide (`-50`, damping lineaire `0.22`) ; `F` gravite forte (`-54`, masse `0.48`) ; `G` plus libre (friction `0.78`, damping angulaire `0.06`) ; `H` casino leger (`-52`, masse `0.46`, restitution `0.34`).
- Retour utilisateur : `B`, `F`, `G` semblent les plus convaincants, mais le de flotte encore trop. Ajustement anti-flottement : lift vertical commun `1.05 -> 0.94`, multiplicateur vertical de relachement `0.58 -> 0.52`, lift lie a la vitesse `0.12 -> 0.10`, vitesse verticale max `4.8 -> 4.3`. Cela agit au relachement, pas pendant le drag.
- Variantes ajoutees : `I` derive de `B` avec gravite `-56`, restitution de `0.24` ; `J` derive de `F` avec gravite `-62`, restitution de `0.23` ; `K` derive de `G` avec gravite `-58`, restitution de `0.25`.
- Choix final utilisateur : `K` devient le profil par defaut. Le selecteur de presets est masque via `SHOW_PHYSICS_PRESET_SELECTOR = false`, mais le code et les profils restent conserves/commentes pour une future calibration.

## Priorite 2 - Performance du rendu

But : conserver un rendu premium, mais sans traitements couteux inutiles ni warnings WebGL.

- [x] Garder la console navigateur sans erreur ni warning WebGL recurrent.
- [x] Mesurer le FPS et la fluidite sur desktop a DPR 1 et DPR 2.
- [x] Mesurer un viewport mobile type 390x844 avec DPR eleve.
- [x] Reduire le poids du bundle si necessaire : analyser les imports Drei, Rapier et Three.
- [x] Eviter tout post-processing couteux tant qu'un rendu natif PBR suffit.
- [x] Stabiliser la texture procedurale du sol avec un bruit deterministe au lieu de `Math.random`.
- [x] Fusionner ou simplifier les geometries de points si elles deviennent un cout visible.
- [x] Ajuster shadow map, soft shadows et DPR pour garder un bon compromis qualite/performance.
- [x] Ajouter une note de budget cible : temps de frame, taille bundle acceptable, nombre de draw calls approximatif.

Budget rendu retenu 2026-06-27 :

- Budget frame : desktop DPR 1 `<= 16.7ms`, desktop DPR 2 `<= 24ms`, mobile 390x844 DPR 2 `<= 33ms`.
- Budget bundle : JS gzip acceptable `<= 1100 kB`; build courant `1069.18 kB gzip`, warning Vite accepte pour cette demo mono-ecran Three/Rapier.
- Instrumentation : `?perf=1` active les mesures internes dans `window.__3diceLastRenderMetrics` et `window.__3diceRenderMetrics`; `?dpr=1` ou `?dpr=2` force la mesure DPR sans UI permanente.
- Mesures : desktop DPR 1 `60.0fps`, `16.67ms`, `23` draw calls, `24596` triangles ; desktop DPR 2 `60.2fps`, `16.62ms`, `23` draw calls, `24596` triangles ; mobile 390x844 DPR 2 `60.1fps`, `16.63ms`, `23` draw calls, `24596` triangles.
- Reglages retenus : Canvas DPR par defaut `[1, 1.75]`, `SoftShadows` `12` samples, shadow map `2048`, aucun post-processing.
- Decision : ne pas fusionner les points du de pour l'instant ; le cout mesure reste faible et les pips separes gardent le code simple et lisible.

## Priorite 3 - Realisme visuel sobre

But : ameliorer l'impression photorealiste sans degrader la performance.

- [x] Ameliorer les points du de : effet creuse visuel, normal map ou geometrie fine si le cout reste bas.
- [x] Ajuster la matiere ivoire : roughness, clearcoat, tonemapping, intensite de l'environnement.
- [ ] Ameliorer le contact avec le sol : ombre plus lisible, pas de halo ou flottement.
- [ ] Rendre le plateau plus mat et textural sans bruit visuel excessif.
- [x] Ajouter un feedback d'impact localise quand le de touche une limite invisible.
- [ ] Verifier que le de reste lisible sur fond sombre en desktop et mobile.
- [ ] Garder la palette sobre : graphite, ivoire, noir, pas d'accent flashy.

Points du de retenus 2026-06-28 :

- Decision : remplacer les 21 disques plats par deux `InstancedMesh` partages, un disque noir et un anneau sombre de recess, pour donner un effet creuse sans CSG ni texture supplementaire.
- Valeurs : disque noir rayon `0.066`, anneau sombre `0.071 -> 0.098`, offset surface `0.0065`, `44` segments. Materiaux `MeshStandardMaterial` rugueux pour rester coherents avec le rendu PBR natif.
- Cout mesure : `4` draw calls apres changement, `40864` triangles, desktop 1280x900 DPR 2 `60.0fps` / `16.67ms`, mobile 390x844 DPR 2 `60.0fps` / `16.67ms`.
- Decision : accepter la hausse de triangles par rapport aux anciens disques, car les instances reduisent fortement les draw calls et les budgets frame restent respectes.

Matiere ivoire retenue 2026-06-28 :

- De : couleur `#efe7d3`, roughness `0.62`, clearcoat `0.28`, clearcoat roughness `0.72`, sheen `0.08`, metalness `0`.
- Texture de rugosite : `DataTexture` deterministe `64x64`, seed `0x1c0ffee`, base `218`, variation `24`, repetition `2x2`. Decision : micro-variation de rugosite seulement, sans normal map ni post-processing, pour eviter un effet plastique tout en gardant un cout faible.
- Scene : tone mapping exposure `1.03`, ambient `0.48`, point light secondaire `0.36`, environment intensity `0.48`.
- Mesures : desktop 1280x720 DPR 2 stable `60.0fps` / `16.67ms`, lancer en mouvement `44.1fps` / `22.69ms` sous budget DPR 2 `24ms`, mobile 390x844 DPR 2 `60.0fps` / `16.67ms`, `4` draw calls, `40864` triangles, JS gzip `1069.72 kB`.

## Priorite 4 - Robustesse et maintenance

But : faciliter les iterations sans casser la sensation physique.

- [ ] Isoler davantage la logique de drag physique si `Dice.tsx` devient trop dense.
- [ ] Ajouter une petite couche de debug optionnelle en code, masquee par defaut, pour lire vitesse lineaire, vitesse angulaire et face detectee.
- [x] Documenter les invariants : pas de sidebar, pas de gros menu, interaction immediate.
- [x] Ajouter des tests pour la detection de repos si elle est extraite en fonction pure.
- [x] Garder `README.md` a jour apres chaque changement majeur de stack ou de comportement.

## Plus tard - Personnalisation

Ces points ne doivent pas passer avant les priorites 1 et 2.

- [ ] Choix discret de couleur/matiere du de.
- [ ] Choix de plateau ou couleur de fond.
- [ ] Types de monde : ouvert par defaut, borne reutilisable depuis `BoundedWorld`.
- [ ] Plusieurs des.
- [x] Presets de physique, seulement si les valeurs realistes par defaut sont deja solides.
- [ ] Export ou sauvegarde des reglages, seulement si un vrai besoin apparait.

## Plus tard - UI/UX

Ces points ne doivent pas transformer la demo en dashboard.

- [ ] Micro-indication de prise pendant le drag, si elle reste elegante et non intrusive.
- [ ] Animation subtile du resultat final.
- [ ] Aide contextuelle plus claire sur mobile.
- [ ] Meilleur feedback du bouton Reset.
- [ ] Eventuel panneau compact de reglages, cache par defaut, apres stabilisation de la physique.

## Definition of Done par iteration

- [ ] La modification cible une case prioritaire de cette roadmap.
- [ ] Le code reste simple et localise.
- [ ] `npm run build` passe.
- [ ] `npm run test` passe.
- [ ] Le comportement est teste manuellement si l'iteration touche la physique ou le rendu.
- [ ] Cette roadmap est mise a jour : case cochee, note ajoutee ou decision documentee.

## Journal d'avancement

Ajouter les notes courtes ici, dans l'ordre chronologique.

- 2026-06-26 : version initiale de la roadmap. Priorite absolue confirmee : realisme du lance, puis performance du rendu, puis personnalisation et UI/UX.
- 2026-06-27 : relachement du de converti en impulsion Rapier appliquee au point attrape, masse positive et gravite verticale, sol avec collider epais explicite, tests unitaires `getThrowVectors`/impulsion ajoutes. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, drag court/rapide/vertical/coin/face, Reset, detection de face apres immobilisation. Decision : clamp d'impulsion conserve pour eviter les vitesses irreelles.
- 2026-06-27 : plateau agrandi, murs/plafond invisibles hauts, camera avec suivi amorti leger, faces du de corrigees via tests de pips, ripple rouge clair localise et aligne sur le plan de contact mur/plafond. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop, console sans erreur/warning applicatif.
- 2026-06-27 : mapping du drag remplace par un geste relatif camera/sol pour permettre les lancers avant/arriere et diagonaux sans mode supplementaire. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, drag lateral/avant/diagonal, lancer diagonal stabilise `Face: 6`, console sans erreur/warning applicatif.
- 2026-06-27 : lift du drag arriere corrige : le signe vertical garde la profondeur avant/arriere, mais la hauteur utilise l'amplitude absolue du geste pour ne plus tirer le de vers le sol. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop, drag arriere tenu, lancer arriere stabilise `Face: 6`, console sans erreur/warning applicatif.
- 2026-06-27 : collider du de remplace par `RoundCuboidCollider` Rapier (`0.49`, `0.49`, `0.49`, rayon `0.06`) pour mieux suivre le de visuellement arrondi sans collider compose. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, drag court/rapide lateral/vertical/arriere/coin/face, Reset, detection de face apres immobilisation, captures et controle pixel canvas OK, console sans erreur/warning.
- 2026-06-27 : stabilisation finale renforcee avec `getNextSettleState`, exigeant immobilite et face dominante stable avant `onSettle`; tests unitaires de repos ajoutes. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, console sans erreur/warning, captures et controle pixel canvas OK. Mesures desktop : court `Face: 1` `1036ms`, rapide lateral `Face: 5` `2018ms`, vertical `Face: 2` `2069ms`, arriere `Face: 3` `1536ms`, coin `Face: 6` `1870ms`, face `Face: 2` `1617ms`; mobile court `Face: 2` `1333ms`; Reset OK.
- 2026-06-27 : priorite performance rendu traitee : instrumentation masquee `?perf=1`, DPR mesurable via `?dpr=1|2`, bruit du sol deterministe, DPR par defaut borne a `[1, 1.75]`, soft shadows reduites a `12` samples et budget rendu documente. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, console sans erreur/warning, captures et controle pixel canvas OK, drag court desktop/mobile et Reset OK. Mesures : desktop DPR 1 `60.0fps`/`16.67ms`, desktop DPR 2 `60.2fps`/`16.62ms`, mobile DPR 2 `60.1fps`/`16.63ms`, `23` draw calls, `24596` triangles, JS gzip `1068.91 kB`.
- 2026-06-27 : micro-ajustements physiques exposes en 9 presets compacts `0` a `H`, limites au drop/contacts pour comparer gravite, masse, friction, restitution et damping sans toucher au drag. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright mobile, selection des 9 presets, lancers B/D/F/H stabilises (`Face: 1/5/3/4`, `1150ms` a `1565ms`), Reset OK, console sans erreur/warning, captures desktop/mobile et controle pixel canvas OK. Decision : exception UI demandee pour choisir la sensation finale, mais sans panneau ni personnalisation large.
- 2026-06-27 : retour utilisateur integre : `B`, `F`, `G` conserves et ajout de variantes anti-flottement `I/J/K`, avec gravite renforcee et lift vertical de relachement reduit. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright mobile, selection des 12 presets, lancers `B/I/J/K` stabilises (`Face: 1/1/3/2`, `1100ms` a `1388ms`), Reset OK, console sans erreur/warning, capture mobile et controle pixel canvas OK. Decision : ne pas toucher au mouvement pendant le drag.
- 2026-06-27 : profil `K` retenu comme physique par defaut et comparateur de presets masque, en conservant le code dormant pour une future calibration. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, UI sans presets (`0` bouton), lancer mobile stabilise `Face: 1` en `1216ms`, Reset OK, console sans erreur/warning, captures et controle pixel canvas OK.
- 2026-06-27 : monde ouvert active : suppression des murs/plafond de la scene active, sol tres large, code de monde borne conserve dans `src/components/worlds/BoundedWorld.tsx`, camera suiveuse avec zoom wheel/pinch. Retour utilisateur corrige : la camera ne suit plus pendant le drag, elle reprend seulement au relachement. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, drag maintenu sans decrochage camera, zoom large/proche desktop, Reset OK, console sans erreur/warning, captures et controle pixel canvas OK.
- 2026-06-27 : audit camera monde ouvert : clamp de drag corrige pour rester relatif au point de prise loin de l'origine, suivi camera rendu plus reactif apres relachement, et Reset camera rendu immediat avec retour position/cible/zoom sans amortissement. Validation : `npm run build`, `npm run test`, serveur Vite local + Playwright desktop/mobile, lancer loin suivi a `250/750/1500ms`, drag maintenu sans snap, Reset apres lancer loin + zoom a `70ms`, console sans erreur/warning.
- 2026-06-27 : preparation publication GitHub : ajout `.gitignore`, README public complet, `CONTRIBUTING.md`, notes d'architecture, et maintien de `AGENTS.md` en fichier local ignore. Validation : scan des mentions internes hors fichiers ignores, `npm run build`, `npm run test`.
- 2026-06-27 : miniature navigateur ajustee sur la face `3` du de via favicon SVG inline. Validation : `npm run build`, `npm run test`.
- 2026-06-28 : points du de rendus en effet creuse sobre via disque noir + anneau sombre instancies, sans changer la physique ni la detection de face. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, lancer stabilise `Face: 4`, Reset OK, console sans erreur/warning, captures visuelles OK. Decision : Browser integre indisponible (`agent.browsers.list()` vide), validation faite avec Playwright CLI.
- 2026-06-28 : matiere ivoire ajustee avec roughness map deterministe, clearcoat reduit, tonemapping et environnement recalibres pour un de moins plastique et plus mat. Validation : `npm run build`, `npm run test`, `npm run dev` + Playwright desktop/mobile, lancer stabilise `Face: 1`, Reset OK, console sans erreur/warning, captures visuelles OK. Decision : pas de normal map pour l'instant, la rugosite suffit et garde le rendu sobre.
