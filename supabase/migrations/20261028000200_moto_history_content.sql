-- Contenu initial de « Histoire de la moto » (note 22), généré par scripts/history/build-seed.mjs.
-- Inséré une seule fois : les corrections se font ensuite dans Console › Histoire (jamais écrasées ici).
-- Images : Wikimedia Commons (domaine public, CC0, CC BY, CC BY-SA), fichiers dans le bucket public history.

-- Husqvarna remonte à 1689 (manufacture d'armes) : année de création acceptée dès 1600
alter table public.history_brands drop constraint if exists history_brands_founded_year_check;
alter table public.history_brands add constraint history_brands_founded_year_check check (founded_year between 1600 and 2100);

insert into public.history_chapters (slug, title, subtitle, body, timeline, sort_order) values ($h$debuts-du-deux-roues$h$, $h$Les débuts du deux-roues$h$, $h$De la draisienne en bois à la première moto vendue en série$h$, $h$Avant le moteur, il a fallu inventer l'idée même de tenir en équilibre sur deux roues alignées. Ça paraît évident aujourd'hui ; au début du XIXe siècle, c'était une petite révolution.

## 1817 : la draisienne, deux roues et des chaussures

Tout commence à Mannheim, en Allemagne, avec le baron Karl Drais. En 1817, il présente sa « Laufmaschine », littéralement la « machine à courir » : un cadre en bois, deux roues l'une derrière l'autre, une selle et un guidon qui fait tourner la roue avant. Pas de pédales : on avance en poussant le sol avec les pieds, comme sur les petits vélos d'équilibre des enfants d'aujourd'hui.

Le 12 juin 1817, Drais fait à Mannheim une première sortie publique de plusieurs kilomètres. L'engin fait sensation et prend le nom de son inventeur : en France, on l'appelle la draisienne. Drais obtient même un brevet en France en 1818. On avance souvent que l'invention doit quelque chose à la terrible « année sans été » de 1816, quand les mauvaises récoltes rendaient les chevaux coûteux à nourrir ; c'est une hypothèse d'historiens, pas un fait établi.

L'essentiel est ailleurs : la draisienne prouve qu'on garde l'équilibre sur deux roues en mouvement, à condition de diriger la roue avant. Tout ce qui suivra, vélo comme moto, repose sur ce principe.

## Les années 1860 : des pédales, puis de la vapeur

Pendant des décennies, on cherche comment avancer sans toucher le sol. Dans les années 1860, à Paris, l'atelier de Pierre Michaux popularise le vélocipède à pédales fixées sur la roue avant. Le vélo moderne n'est pas encore là (il faudra la chaîne et les roues de même taille), mais l'engin se vend et les courses se multiplient.

Et très vite, certains rêvent d'y ajouter un moteur. L'ingénieur français Louis-Guillaume Perreaux installe une petite machine à vapeur sur un vélocipède Michaux, à la fin des années 1860 : c'est le vélocipède à vapeur Michaux-Perreaux, souvent cité comme l'un des tout premiers deux-roues motorisés. Chaudière, foyer, tuyauterie : on est loin de la moto légère, mais l'idée est lancée. À la même époque, aux États-Unis, Sylvester Roper construit lui aussi des vélocipèdes à vapeur.

La vapeur a pourtant un gros défaut sur un deux-roues : il faut porter le feu, l'eau et le combustible. La vraie bascule viendra d'un autre moteur.

## 1885 : le Reitwagen, le moteur à essence monte sur deux roues

En 1885, à Cannstatt, près de Stuttgart, Gottlieb Daimler et Wilhelm Maybach mettent au point un moteur à essence à quatre temps, léger et rapide pour l'époque. Pour l'essayer, ils l'installent dans un engin à deux roues au cadre en bois, avec deux petites roues latérales pour l'empêcher de tomber : le « Reitwagen », la « voiture à chevaucher ». Daimler dépose le brevet la même année.

Le Reitwagen n'a pas été conçu pour être vendu : c'était un banc d'essai roulant pour le moteur, et Daimler s'est ensuite consacré à l'automobile. Mais c'est le premier deux-roues mû par un moteur à essence, et beaucoup le considèrent comme l'ancêtre direct de la moto. Des répliques sont exposées dans plusieurs musées allemands.

## 1894 : Hildebrand & Wolfmüller, la première moto produite en série

Neuf ans plus tard, à Munich, Heinrich Hildebrand, son frère Wilhelm et Alois Wolfmüller franchissent l'étape décisive : vendre des motos à des clients. Leur machine de 1894 est la première moto fabriquée en série, et c'est pour elle qu'on emploie le mot allemand « Motorrad ».

La technique est étonnante : un gros bicylindre à quatre temps de près de 1 500 cm³, couché dans le cadre, dont les bielles attaquent directement la roue arrière, un peu comme sur une locomotive. Il n'y a ni embrayage ni boîte de vitesses, et on la démarre en la poussant. Elle atteint environ 45 km/h, une vitesse folle pour les routes de l'époque. En France, elle a été produite sous licence sous le nom de « Pétrolette ».

Trop chère et trop capricieuse, elle ne fait pas fortune. Mais elle a ouvert la voie : la moto devient un produit.

## 1895-1901 : la France invente la moto « normale »

À la fin du XIXe siècle, la France est à la pointe. Le moteur De Dion-Bouton, petit, léger et capable de tourner vite, équipe une foule de tricycles à moteur et inspire les constructeurs de toute l'Europe.

À Paris, les frères Michel et Eugène Werner, d'origine russe, lancent en 1897 un vélo à moteur qu'ils baptisent « Motocyclette », un nom qu'ils déposent et qui deviendra un mot courant. Leur premier modèle a le moteur au-dessus de la roue avant, ce qui le rend instable. En 1901, la « nouvelle Werner » place le moteur en bas du cadre, entre les roues, à l'endroit du pédalier : centre de gravité bas, meilleure tenue de route. C'est l'architecture que presque toutes les motos adopteront ensuite.

## 1901-1910 : les grandes marques entrent en scène

Les premières années du XXe siècle voient naître ou se lancer dans la moto des noms qui roulent encore aujourd'hui : Indian aux États-Unis en 1901, Triumph et Norton en Angleterre en 1902, Harley-Davidson à Milwaukee en 1903, Husqvarna en Suède en 1903, sans oublier Peugeot en France. Les courses servent de laboratoire : en 1907 se court la première édition du Tourist Trophy sur l'île de Man, une épreuve mythique qui existe toujours.

En moins d'un siècle, on est passé d'une machine en bois poussée avec les pieds à des motos capables de tenir la route pendant des heures. La suite, ce sont les marques qui l'écrivent : à découvrir dans leurs fiches.$h$, $h$[{"year":"1817","text":"Karl Drais présente sa « Laufmaschine » à Mannheim : la draisienne."},{"year":"1818","text":"Drais obtient un brevet en France."},{"year":"Années 1860","text":"L’atelier de Pierre Michaux, à Paris, popularise le vélocipède à pédales."},{"year":"Fin des années 1860","text":"Vélocipède à vapeur Michaux-Perreaux."},{"year":"1885","text":"Daimler et Maybach construisent le Reitwagen, premier deux-roues à moteur à essence."},{"year":"1894","text":"Hildebrand & Wolfmüller : première moto produite en série."},{"year":"1897","text":"Les frères Werner lancent la « Motocyclette »."},{"year":"1901","text":"La nouvelle Werner place le moteur en bas du cadre : l’architecture moderne."},{"year":"1907","text":"Premier Tourist Trophy de l’île de Man."}]$h$::jsonb, 1)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$yamaha$h$, $h$Yamaha$h$, $h$JP$h$, 1955, $h$Hamamatsu, Japon$h$, $h$Genichi Kawakami (Yamaha Motor), issue du fabricant d’instruments de musique fondé par Torakusu Yamaha$h$, $h$Des pianos aux pistes du Dakar : la marque aux trois diapasons$h$, $h$Peu de marques de motos peuvent dire qu'elles viennent de la musique. Yamaha, si. Avant de faire des motos, le nom Yamaha était celui d'un fabricant d'orgues et de pianos fondé à la fin du XIXe siècle par Torakusu Yamaha. Les trois diapasons croisés qu'on voit sur les réservoirs rappellent encore cette origine.

## Une libellule rouge pour commencer

Au début des années 1950, le président de l'entreprise, Genichi Kawakami, cherche de nouveaux débouchés pour les machines-outils de l'usine. Le Japon d'après-guerre a besoin de se déplacer, et la petite moto est le moyen le plus accessible. Le 1er juillet 1955 naît Yamaha Motor, une société à part entière.

Son premier modèle, la YA-1, est une 125 cm³ deux-temps légère et fine, inspirée de la DKW RT 125 allemande. Avec sa robe bordeaux et sa silhouette élancée, elle gagne vite un surnom : « Aka-tombo », la libellule rouge. Elle remporte des courses au Japon dès sa première année. Le ton est donné : chez Yamaha, la course sert de vitrine et de laboratoire.

## Le roi du deux-temps

Pendant les années 1960 et 1970, Yamaha devient le spécialiste du moteur deux-temps : des motos légères, nerveuses et faciles à entretenir. Les petites routières sportives de la marque font le bonheur des jeunes motards, et en course, les Yamaha deviennent incontournables.

En vitesse, la marque a aligné des pilotes de légende. L'Américain Kenny Roberts remporte le championnat du monde 500 trois années de suite, de 1978 à 1980, en imposant un style de pilotage en glisse venu du dirt-track. Eddie Lawson et Wayne Rainey prolongent la série. Plus tard, en MotoGP, Valentino Rossi offre à Yamaha quatre titres (2004, 2005, 2008, 2009), Jorge Lorenzo trois (2010, 2012, 2015), et le Français Fabio Quartararo devient champion du monde en 2021.

## L'XT500 et le désert

Pour les motards français, Yamaha, c'est aussi l'aventure. En 1976 sort l'XT500, un gros monocylindre quatre-temps simple et robuste, taillé pour les pistes. Quand Thierry Sabine lance le premier Paris-Dakar fin 1978, c'est un Français sur XT500, Cyril Neveu, qui gagne chez les motos, et il récidive l'année suivante. Plus tard, Stéphane Peterhansel remporte six fois le Dakar à moto sur Yamaha avant de briller en auto. L'XT500 est devenue culte, et le trail est entré dans les garages français.

## Des motos pour tous les goûts

Yamaha a toujours aimé surprendre. La V-Max de 1985 et son énorme V4 ont créé un style à elles seules. Les moteurs à cinq soupapes par cylindre ont marqué les années 1980. En 1998, la YZF-R1 a redéfini la sportive de 1 000 cm³ : légère, compacte, explosive.

Et puis il y a le TMAX, lancé en 2001 : un scooter avec des performances et une tenue de route de moto, devenu un phénomène dans les grandes villes françaises. Plus récemment, les MT-07 et MT-09 sont devenues parmi les motos les plus vendues en France, la MT-07 étant un choix très courant des jeunes permis A2.

## Aujourd'hui

Yamaha Motor a son siège à Iwata, au Japon, et fabrique aussi des moteurs de bateaux, des quads et bien d'autres engins. La marque reste présente en MotoGP, en Superbike et en tout-terrain, et propose une gamme qui va du scooter urbain à la sportive de piste.$h$, $h$[{"year":"1887","text":"Torakusu Yamaha commence à fabriquer des orgues : l’origine du nom."},{"year":"1955","text":"Création de Yamaha Motor ; première moto, la YA-1 « libellule rouge »."},{"year":"1976","text":"Sortie de l’XT500."},{"year":"1979","text":"Cyril Neveu gagne le premier Paris-Dakar à moto, sur XT500."},{"year":"1978-1980","text":"Kenny Roberts, trois titres mondiaux 500 d’affilée."},{"year":"1985","text":"Lancement de la V-Max."},{"year":"1998","text":"YZF-R1."},{"year":"2001","text":"Lancement du TMAX."},{"year":"2004","text":"Premier titre MotoGP de Valentino Rossi avec Yamaha."},{"year":"2021","text":"Fabio Quartararo champion du monde MotoGP."}]$h$::jsonb, $h$[{"name":"YA-1","year":"1955","text":"La première Yamaha, 125 cm³ deux-temps, surnommée « Aka-tombo », la libellule rouge."},{"name":"XT500","year":"1976","text":"Le monocylindre increvable qui a gagné les deux premiers Paris-Dakar à moto."},{"name":"V-Max","year":"1985","text":"Un V4 énorme dans un style de dragster : une icône à part."},{"name":"YZF-R1","year":"1998","text":"La sportive qui a remis à plat la catégorie 1 000 cm³."},{"name":"TMAX","year":"2001","text":"Le maxi-scooter qui se conduit comme une moto, star des villes françaises."}]$h$::jsonb, $h$["Les trois diapasons du logo rappellent que Yamaha a commencé par les instruments de musique.","Fabio Quartararo, né à Nice, est en 2021 le premier Français champion du monde de la catégorie reine."]$h$::jsonb, $h$Siège à Iwata (Japon). Gamme complète, du scooter au trail et à la sportive, avec des MT-07 et MT-09 parmi les motos les plus vendues en France. Présente en MotoGP et en Superbike.$h$, 1)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$honda$h$, $h$Honda$h$, $h$JP$h$, 1948, $h$Hamamatsu, Japon$h$, $h$Soichiro Honda, rejoint en 1949 par Takeo Fujisawa$h$, $h$Le plus grand constructeur de motos au monde, né d’un moteur sur un vélo$h$, $h$L'histoire de Honda est celle d'un mécanicien obstiné. Soichiro Honda, fils de forgeron, passionné de moteurs et de course, commence par réparer des voitures puis fabriquer des segments de piston. Après la guerre, il fonde en 1946 à Hamamatsu un petit institut de recherche technique, et le 24 septembre 1948 naît Honda Motor Co.

## Des moteurs sur des vélos

Dans le Japon ruiné de l'après-guerre, l'essence est rare et les transports aussi. Soichiro Honda a une idée simple : récupérer de petits moteurs militaires de groupes électrogènes et les monter sur des bicyclettes. Le succès est immédiat. Quand le stock s'épuise, il fabrique ses propres moteurs.

En 1949 arrive la première vraie moto de la marque, la Dream type D. La même année, Honda s'associe à Takeo Fujisawa, un homme d'affaires redoutable. Le duo est complémentaire : Honda invente, Fujisawa vend et organise. Sans lui, la petite entreprise ne serait sans doute jamais devenue un géant.

## Le Super Cub, la machine qui a motorisé le monde

En 1958 sort le Super Cub, une petite moto à cadre poutre, carénage avant, embrayage automatique et moteur quatre-temps économe. Facile, propre, increvable, il séduit des gens qui ne se seraient jamais vus à moto. Aux États-Unis, une campagne publicitaire restée célèbre affirme « You meet the nicest people on a Honda » : on croise les gens les plus sympas sur une Honda. En 2017, la production cumulée du Super Cub et de ses dérivés passe le cap des 100 millions d'exemplaires : c'est le véhicule à moteur le plus produit de l'histoire.

## L'île de Man, puis le choc de la CB750

Soichiro Honda veut prouver que le Japon peut battre l'Europe en course. En 1959, Honda débarque au Tourist Trophy de l'île de Man avec des petites cylindrées. Deux ans plus tard, en 1961, Mike Hailwood remporte les courses 125 et 250 sur Honda. Les Européens découvrent des moteurs multicylindres qui tournent à des régimes incroyables.

En 1969, la CB750 Four fait l'effet d'une bombe : un quatre-cylindres en ligne transversal, un frein à disque à l'avant, un démarreur électrique, une fiabilité japonaise et un prix accessible. Elle est souvent considérée comme la première « superbike » moderne. Les constructeurs britanniques, déjà fragiles, ne s'en remettront pas.

## Une marque de toutes les aventures

La suite est une avalanche de modèles marquants. La Gold Wing de 1975 invente la grande routière de voyage. Au Dakar, Honda gagne quatre fois d'affilée à la fin des années 1980, et la route hérite de l'Africa Twin en 1988. En 1992, la CBR900RR Fireblade, conçue par l'équipe de Tadao Baba, prouve qu'une grosse sportive peut être légère.

En Grand Prix, Honda a remporté une quantité de titres. Valentino Rossi y gagne le dernier titre 500 en 2001, puis les deux premiers titres MotoGP en 2002 et 2003. Marc Márquez y remporte six titres MotoGP entre 2013 et 2019.

## Aujourd'hui

Honda est le premier constructeur de motos au monde, avec des usines sur plusieurs continents. La gamme va des petites cylindrées vendues par millions en Asie à la Gold Wing, en passant par l'Africa Twin, revenue en 2016, et les Fireblade. La marque fabrique aussi des voitures, des moteurs marins et même des avions d'affaires.$h$, $h$[{"year":"1946","text":"Soichiro Honda fonde un institut de recherche technique à Hamamatsu."},{"year":"1948","text":"Création de Honda Motor Co. (24 septembre)."},{"year":"1949","text":"Première moto, la Dream type D ; arrivée de Takeo Fujisawa."},{"year":"1958","text":"Lancement du Super Cub."},{"year":"1959","text":"Première participation au Tourist Trophy de l’île de Man."},{"year":"1961","text":"Mike Hailwood gagne les TT 125 et 250 sur Honda."},{"year":"1969","text":"CB750 Four."},{"year":"1975","text":"Gold Wing."},{"year":"1988","text":"Africa Twin."},{"year":"1992","text":"CBR900RR Fireblade."},{"year":"2017","text":"Le Super Cub et ses dérivés dépassent 100 millions d’exemplaires."}]$h$::jsonb, $h$[{"name":"Super Cub","year":"1958","text":"Le véhicule à moteur le plus produit de l’histoire."},{"name":"CB750 Four","year":"1969","text":"Quatre cylindres, disque avant, démarreur électrique : la première superbike moderne."},{"name":"Gold Wing","year":"1975","text":"La reine du grand voyage, devenue une institution."},{"name":"Africa Twin","year":"1988","text":"Le trail né des victoires au Dakar, relancé en 2016."},{"name":"CBR900RR Fireblade","year":"1992","text":"La grosse sportive enfin légère."}]$h$::jsonb, $h$["Les premières « Honda » étaient des bicyclettes équipées de petits moteurs militaires récupérés.","La publicité « You meet the nicest people on a Honda » a changé l’image de la moto aux États-Unis dans les années 1960."]$h$::jsonb, $h$Premier constructeur mondial de motos. Gamme de la petite cylindrée au grand tourisme (Gold Wing), trails Africa Twin, sportives Fireblade. Engagée en MotoGP, en Superbike et au Dakar.$h$, 2)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$kawasaki$h$, $h$Kawasaki$h$, $h$JP$h$, 1878, $h$Tokyo, Japon (chantier naval) ; motos à partir des années 1950-1960$h$, $h$Shozo Kawasaki$h$, $h$Le vert, la Z1 et la vitesse : l’esprit Ninja$h$, $h$Kawasaki n'est pas né dans un garage mais dans un chantier naval. En 1878, Shozo Kawasaki fonde à Tokyo un chantier qui deviendra un géant de l'industrie lourde japonaise : navires, locomotives, avions… Les motos arrivent bien plus tard, comme une branche parmi d'autres d'un immense groupe industriel.

## De l'avion à la moto

Après la Seconde Guerre mondiale, les ingénieurs aéronautiques de Kawasaki se reconvertissent. Dans les années 1950, le groupe fabrique des moteurs de motos, puis des motos complètes. Pour aller plus vite, il reprend au début des années 1960 Meguro, un constructeur japonais réputé pour ses grosses bicylindres. La W1 de 1966, héritière directe de ce savoir-faire, est la grosse moto de la marque à l'époque. Son nom revit aujourd'hui avec les W800 néo-rétro.

## Le coup de tonnerre de la Mach III

En 1969, Kawasaki lance la 500 H1, surnommée Mach III : un trois-cylindres deux-temps qui accélère comme rien d'autre à l'époque. Puissante, légère, avec un châssis vite dépassé, elle se forge une réputation de moto sauvage, réservée aux pilotes qui ont du cran. Avec elle, Kawasaki se fait un nom : celui de la marque des performances.

## La Z1, la « reine »

En 1972 arrive la 900 Z1. Un quatre-cylindres quatre-temps à double arbre à cames en tête, plus gros et plus puissant que la Honda CB750 sortie trois ans plus tôt. Elle est rapide, robuste, et devient la référence de la grosse moto des années 1970. En France comme ailleurs, la « Zed » est entrée dans la légende, et son style inspire encore les Z900RS d'aujourd'hui.

## Ninja

En 1984, la GPz900R inaugure le nom Ninja : une sportive à quatre cylindres refroidis par eau, très rapide pour l'époque. Deux ans plus tard, Tom Cruise la pilote dans le film Top Gun, et toute une génération la découvre. Le nom Ninja ne quittera plus les sportives de la marque.

La quête de vitesse continue : la ZZ-R1100 de 1990 compte parmi les motos de série les plus rapides de son temps, et en 2015 la Ninja H2 surprend tout le monde avec un moteur suralimenté par compresseur, une rareté sur une moto de série.

## Le vert de la course

En compétition, les Kawasaki sont reconnaissables à leur vert vif. Le Sud-Africain Kork Ballington remporte les titres mondiaux 250 et 350 en 1978 et 1979. Mais le règne le plus impressionnant est celui de Jonathan Rea en Superbike : six titres mondiaux d'affilée, de 2015 à 2020, sur la ZX-10R. Kawasaki est aussi très présente en motocross.

## Aujourd'hui

Depuis 2021, l'activité moto est regroupée dans une société dédiée, Kawasaki Motors, filiale du groupe Kawasaki Heavy Industries. La gamme va de la petite Ninja 125 aux Z et aux sportives, en passant par les Versys et les néo-rétro. Sur les routes françaises, les Z sont parmi les roadsters les plus populaires.$h$, $h$[{"year":"1878","text":"Shozo Kawasaki fonde un chantier naval à Tokyo."},{"year":"Années 1950","text":"Le groupe commence à fabriquer des moteurs de motos."},{"year":"Années 1960","text":"Reprise du constructeur Meguro."},{"year":"1966","text":"W1, grosse bicylindre héritée de Meguro."},{"year":"1969","text":"500 H1 Mach III."},{"year":"1972","text":"900 Z1."},{"year":"1984","text":"GPz900R, la première Ninja."},{"year":"1986","text":"La GPz900R au cinéma dans Top Gun."},{"year":"2015","text":"Ninja H2 à compresseur ; premier des six titres Superbike consécutifs de Jonathan Rea."},{"year":"2021","text":"Création de Kawasaki Motors."}]$h$::jsonb, $h$[{"name":"500 H1 Mach III","year":"1969","text":"Trois-cylindres deux-temps, accélérations brutales, réputation sulfureuse."},{"name":"900 Z1","year":"1972","text":"Le quatre-cylindres double arbre qui a dominé les années 1970."},{"name":"GPz900R Ninja","year":"1984","text":"La première Ninja, star de Top Gun."},{"name":"Ninja H2","year":"2015","text":"Une moto de série à compresseur."}]$h$::jsonb, $h$["Kawasaki a commencé par construire des navires, bien avant les motos.","Le vert des Kawasaki de course est devenu la couleur signature de la marque."]$h$::jsonb, $h$Kawasaki Motors (groupe Kawasaki Heavy Industries) depuis 2021. Gamme Ninja, Z, Versys et néo-rétro (Z900RS, W800). Très présente en Superbike et en motocross.$h$, 3)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$suzuki$h$, $h$Suzuki$h$, $h$JP$h$, 1909, $h$Hamamatsu, Japon$h$, $h$Michio Suzuki$h$, $h$Des métiers à tisser à la Hayabusa$h$, $h$Avant de faire rugir des moteurs, Suzuki faisait tourner des métiers à tisser. En 1909, Michio Suzuki fonde à Hamamatsu une entreprise de machines textiles. Ses métiers sont réputés, mais le marché est fragile, et l'entreprise cherche très tôt d'autres activités.

## Un moteur auxiliaire pour commencer

Après la guerre, comme Honda dans la même ville, Suzuki se lance dans le vélo à moteur. En 1952, la Power Free est une bicyclette équipée d'un petit moteur deux-temps. Le succès pousse l'entreprise à aller plus loin : en 1954, elle prend le nom de Suzuki Motor et sort la Colleda, une vraie petite moto.

Suzuki se spécialise dans le deux-temps, comme Yamaha, et cherche à se faire connaître en course. Au début des années 1960, l'arrivée d'un ingénieur venu de l'Allemagne de l'Est, spécialiste des deux-temps de compétition, aide la marque à rattraper son retard. Suzuki remporte en 1962 le premier titre mondial 50 cm³ de l'histoire.

## La « bouilloire » et les années 1970

En 1971, la GT750 surprend : un gros trois-cylindres deux-temps refroidi par eau, une rareté à l'époque. Son radiateur lui vaut des surnoms affectueux, dont « la bouilloire » ou « water buffalo » en anglais. C'est une grande routière confortable, loin des deux-temps pointus.

En Grand Prix 500, Suzuki trouve un héros : le Britannique Barry Sheene, champion du monde en 1976 et 1977, pilote charismatique et populaire. Plus tard, Kevin Schwantz (1993), Kenny Roberts Jr (2000) et Joan Mir (2020) offrent d'autres titres à la marque.

## Katana, GSX-R, Hayabusa : trois chocs

En 1981, la Katana dessinée par le bureau de style allemand Target Design, avec Hans Muth, impose une ligne futuriste et anguleuse qui divise autant qu'elle fascine. Elle est aujourd'hui culte.

En 1985, la GSX-R750 bouleverse la sportive : un cadre en aluminium, un moteur refroidi par air et huile, un poids très contenu. C'est une moto de course homologuée pour la route, et la lignée GSX-R deviendra l'une des plus célèbres de toutes.

En 1999, la Hayabusa, du nom d'un faucon pèlerin en japonais, frôle les 300 km/h. Elle est à l'origine d'un accord entre constructeurs pour brider les motos de série autour de 300 km/h.

## Des motos pour rouler tous les jours

Suzuki, c'est aussi des motos simples et attachantes : la Bandit, la SV650 à moteur bicylindre en V apparue en 1999, et la famille V-Strom, des trails routiers très appréciés des voyageurs. Au Dakar et en tout-terrain, la marque a aussi sa place avec les DR.

## Aujourd'hui

Suzuki Motor Corporation a toujours son siège à Hamamatsu et fabrique aussi des voitures, très populaires en Inde notamment, et des moteurs de bateaux. La marque a quitté le MotoGP à la fin de la saison 2022, deux ans après le titre de Joan Mir, mais reste très présente en endurance et sur la route avec les GSX-S, V-Strom et Hayabusa.$h$, $h$[{"year":"1909","text":"Michio Suzuki fonde une entreprise de métiers à tisser à Hamamatsu."},{"year":"1952","text":"Power Free, bicyclette à moteur."},{"year":"1954","text":"L’entreprise devient Suzuki Motor ; moto Colleda."},{"year":"1962","text":"Premier titre mondial 50 cm³ de l’histoire."},{"year":"1971","text":"GT750 trois-cylindres deux-temps refroidie par eau."},{"year":"1976-1977","text":"Barry Sheene champion du monde 500."},{"year":"1981","text":"Katana."},{"year":"1985","text":"GSX-R750."},{"year":"1999","text":"Hayabusa ; SV650."},{"year":"2020","text":"Joan Mir champion du monde MotoGP."},{"year":"2022","text":"Suzuki quitte le MotoGP."}]$h$::jsonb, $h$[{"name":"GT750","year":"1971","text":"Le gros deux-temps refroidi par eau, surnommé « la bouilloire »."},{"name":"Katana","year":"1981","text":"Ligne futuriste signée Hans Muth, devenue culte."},{"name":"GSX-R750","year":"1985","text":"La sportive en aluminium qui a lancé une lignée mythique."},{"name":"Hayabusa","year":"1999","text":"Le faucon qui a fait plafonner les vitesses de pointe."}]$h$::jsonb, $h$["Suzuki a commencé par fabriquer des métiers à tisser.","Après la Hayabusa, les constructeurs se sont mis d’accord pour limiter la vitesse des motos de série à environ 300 km/h."]$h$::jsonb, $h$Siège à Hamamatsu. Motos (GSX-S, V-Strom, Hayabusa, SV650), voitures et moteurs marins. A quitté le MotoGP fin 2022 ; reste engagée en endurance.$h$, 8)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$bmw$h$, $h$BMW Motorrad$h$, $h$DE$h$, 1916, $h$Munich, Allemagne$h$, $h$Issue de Rapp Motorenwerke et des moteurs d’avion ; première moto dessinée par Max Friz$h$, $h$Le flat-twin, le cardan et l’invention du gros trail$h$, $h$BMW, pour Bayerische Motoren Werke, les « usines bavaroises de moteurs ». Le nom dit tout : avant les motos et les voitures, BMW faisait des moteurs, et surtout des moteurs d'avion, pendant la Première Guerre mondiale à Munich.

## 1923 : la R32 fixe les règles

Après la guerre, le traité de Versailles interdit à l'Allemagne de construire des moteurs d'avion. BMW doit se reconvertir. L'ingénieur Max Friz dessine une moto qui sera présentée en 1923 : la R32. Son moteur est un bicylindre à plat, cylindres opposés et placés en travers du cadre, bien dans l'air pour le refroidissement, et la transmission se fait par un arbre à cardan plutôt que par une chaîne.

Flat-twin et cardan : cent ans plus tard, ces deux choix restent la signature de BMW. Peu de motos peuvent se vanter d'une telle continuité.

## Records et guerre

Dans les années 1920 et 1930, BMW s'illustre en course et dans la chasse aux records. Le pilote Ernst Henne bat plusieurs fois le record du monde de vitesse à moto, jusqu'à 279,5 km/h en 1937, un record qui tiendra longtemps.

Pendant la Seconde Guerre mondiale, BMW produit notamment la R75, une moto à side-car robuste dont la roue du side-car est entraînée, pour passer partout. Après la guerre, les usines sont détruites ou démontées et la production de motos est d'abord interdite. BMW redémarre avec une petite monocylindre, la R24, en 1948.

## Berlin et les années difficiles

Dans les années 1950, les ventes de motos s'effondrent en Europe : la voiture devient accessible. BMW traverse une période très difficile. La renaissance passe par la série /5 de 1969, avec une nouvelle génération de flat-twins, et par le transfert de la production des motos à Berlin, dans le quartier de Spandau, où elles sont toujours fabriquées.

## La GS invente le gros trail

En 1980, BMW présente la R80G/S, « Gelände/Straße », terrain et route. Une grosse moto à flat-twin capable de rouler sur piste comme sur autoroute : on n'avait jamais vu ça. Au Paris-Dakar, les BMW gagnent avec le Français Hubert Auriol en 1981 et 1983, puis avec le Belge Gaston Rahier en 1984 et 1985.

La GS crée une catégorie entière. Des décennies plus tard, la R1200GS puis la R1250GS et la R1300GS deviennent les motos les plus vendues de la marque, et des références du voyage à moto, très prisées en France.

## Pas seulement des flat-twins

BMW sait aussi surprendre. La K100 de 1983 introduit un quatre-cylindres couché dans le sens de la longueur, surnommé « la brique ». La C1 de 2000 est un scooter à toit. En 2009, la S1000RR, quatre-cylindres sportive, prouve que BMW peut se battre avec les meilleures hypersportives japonaises.

## Aujourd'hui

BMW Motorrad est la division moto du groupe BMW, avec une gamme qui va des petites cylindrées aux GS, routières, roadsters et sportives M. L'usine de Berlin-Spandau reste le cœur de la production, et les GS dominent le marché du gros trail.$h$, $h$[{"year":"1916-1917","text":"Naissance de BMW à Munich, motoriste aéronautique."},{"year":"1923","text":"R32, première moto BMW : flat-twin et cardan."},{"year":"1937","text":"Ernst Henne, record du monde de vitesse à 279,5 km/h."},{"year":"1948","text":"Reprise avec la R24 après la guerre."},{"year":"1969","text":"Série /5 ; production transférée à Berlin-Spandau."},{"year":"1980","text":"R80G/S, le premier gros trail."},{"year":"1981","text":"Hubert Auriol gagne le Paris-Dakar sur BMW."},{"year":"1983","text":"K100, quatre-cylindres « brique »."},{"year":"2009","text":"S1000RR."}]$h$::jsonb, $h$[{"name":"R32","year":"1923","text":"La première BMW : flat-twin et transmission par cardan."},{"name":"R75","year":"Années 1940","text":"La moto à side-car à roue entraînée, increvable."},{"name":"R80G/S","year":"1980","text":"L’inventrice du gros trail, victorieuse au Dakar."},{"name":"R1200GS / R1250GS","year":"2004-2023","text":"Des références du voyage à moto."},{"name":"S1000RR","year":"2009","text":"L’hypersportive allemande."}]$h$::jsonb, $h$["La R32 a été dessinée parce qu’après 1918, BMW n’avait plus le droit de construire des moteurs d’avion.","Hubert Auriol, vainqueur du Dakar sur BMW, en est ensuite devenu le directeur."]$h$::jsonb, $h$Division moto du groupe BMW, production principale à Berlin-Spandau. Gamme GS (dont la R1300GS), routières RT, roadsters et sportives S/M.$h$, 4)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$triumph$h$, $h$Triumph$h$, $h$GB$h$, 1886, $h$Coventry, Angleterre$h$, $h$Siegfried Bettmann, rejoint par Moritz Schulte$h$, $h$Bonneville, Steve McQueen et une renaissance à Hinckley$h$, $h$Triumph, l'une des marques les plus anglaises qui soient, a été fondée par un Allemand. Siegfried Bettmann, né à Nuremberg, s'installe en Angleterre et crée en 1886 une société qui vend d'abord des bicyclettes sous le nom de Triumph. Avec son associé Moritz Schulte, il installe la production à Coventry, alors capitale britannique du cycle.

## De la bicyclette à la « Trusty Triumph »

La première moto Triumph sort en 1902, avec un moteur de marque belge. Très vite, la marque fabrique ses propres moteurs. Pendant la Première Guerre mondiale, son Model H est fourni en grand nombre aux armées alliées. Les estafettes l'adorent pour sa robustesse : on la surnomme la « Trusty Triumph », la Triumph fidèle.

## Edward Turner et la Speed Twin

Dans les années 1930, la marque est rachetée par Jack Sangster, qui confie la direction technique à un designer de génie, Edward Turner. En 1937, Turner présente la Speed Twin, un bicylindre vertical en ligne, léger, compact, élégant. C'est un tournant : pendant des décennies, le « twin parallèle » sera la signature de la moto anglaise.

En novembre 1940, l'usine de Coventry est détruite lors d'un bombardement allemand. Triumph reconstruit tout à Meriden, entre Coventry et Birmingham.

## Bonneville et le cinéma

Les années 1950 et 1960 sont l'âge d'or. Les Triumph se vendent très bien aux États-Unis, et en 1956, une machine à moteur Triumph établit un record de vitesse sur le lac salé de Bonneville, dans l'Utah. En 1959, Triumph baptise sa nouvelle sportive Bonneville T120. La « Bonnie » devient l'archétype de la moto anglaise.

Le cinéma s'en mêle. Dans L'Équipée sauvage (1953), Marlon Brando chevauche une Triumph Thunderbird. Dans La Grande Évasion (1963), la célèbre poursuite de Steve McQueen se fait sur une Triumph TR6 maquillée en moto allemande ; le grand saut au-dessus des barbelés est réalisé par son ami cascadeur Bud Ekins.

## Le déclin, puis la coopérative

Comme toute l'industrie britannique, Triumph souffre face aux motos japonaises, plus modernes et plus fiables. Après des rachats successifs, l'usine de Meriden est occupée par ses ouvriers en 1973, qui finissent par la reprendre sous forme de coopérative. L'aventure dure jusqu'en 1983, quand la société est mise en liquidation.

## Hinckley : la renaissance

C'est là qu'intervient John Bloor, un entrepreneur du bâtiment. Il rachète le nom Triumph en 1983, et au lieu de relancer les vieilles motos, il construit une usine moderne à Hinckley, dans le Leicestershire. La nouvelle gamme, présentée en 1990, repose sur des moteurs modulaires à trois et quatre cylindres.

Le trois-cylindres devient la marque de fabrique de la nouvelle Triumph : Speed Triple en 1994, Street Triple, Tiger, Rocket III. En 2001, une nouvelle Bonneville reprend le nom mythique, et la gamme « Modern Classics » devient un immense succès.

## Aujourd'hui

Triumph a son siège à Hinckley et produit une grande partie de ses motos en Thaïlande. Depuis 2019, c'est elle qui fournit les moteurs trois-cylindres de toutes les motos du championnat du monde Moto2. La gamme va des Bonneville et Speed Twin aux roadsters Trident et Street Triple, aux trails Tiger, et plus récemment aux monocylindres 400 et aux motos de tout-terrain.$h$, $h$[{"year":"1886","text":"Siegfried Bettmann crée Triumph, d’abord pour vendre des bicyclettes."},{"year":"1902","text":"Première moto Triumph."},{"year":"1914-1918","text":"Le Model H, « Trusty Triumph », équipe les armées alliées."},{"year":"1937","text":"Speed Twin d’Edward Turner."},{"year":"1940","text":"L’usine de Coventry est détruite ; reconstruction à Meriden."},{"year":"1959","text":"Bonneville T120."},{"year":"1963","text":"Steve McQueen sur une TR6 dans La Grande Évasion."},{"year":"1983","text":"Liquidation ; John Bloor rachète la marque."},{"year":"1990","text":"Nouvelle gamme conçue à Hinckley."},{"year":"2001","text":"Retour de la Bonneville."},{"year":"2019","text":"Fournisseur unique des moteurs du Moto2."}]$h$::jsonb, $h$[{"name":"Speed Twin","year":"1937","text":"Le bicylindre parallèle qui a défini la moto anglaise."},{"name":"Bonneville T120","year":"1959","text":"La « Bonnie », baptisée d’après les records du lac salé."},{"name":"Speed Triple","year":"1994","text":"Le roadster trois-cylindres de la renaissance."},{"name":"Bonneville (moderne)","year":"2001","text":"Le retour d’un mythe, et le succès des Modern Classics."}]$h$::jsonb, $h$["Le fondateur de Triumph, Siegfried Bettmann, était né en Allemagne.","Le saut de La Grande Évasion a été réalisé par le cascadeur Bud Ekins, pas par Steve McQueen."]$h$::jsonb, $h$Siège à Hinckley (Angleterre), production principalement en Thaïlande. Fournisseur des moteurs du Moto2. Gamme Modern Classics, Trident, Street Triple, Tiger, monocylindres 400.$h$, 5)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$ducati$h$, $h$Ducati$h$, $h$IT$h$, 1926, $h$Bologne, Italie$h$, $h$Antonio Cavalieri Ducati et ses fils Adriano, Bruno et Marcello$h$, $h$Desmodromique, rouge et Superbike : la passion de Bologne$h$, $h$Ducati n'a pas commencé par les motos, ni même par les moteurs, mais par la radio. En 1926, à Bologne, Antonio Cavalieri Ducati et ses trois fils fondent une société qui fabrique des composants électriques, notamment des condensateurs pour les postes de radio. L'entreprise grandit vite et s'installe dans une grande usine à Borgo Panigale, à la périphérie de Bologne, là où se trouve toujours le siège.

## Le Cucciolo, le petit chiot de l'après-guerre

L'usine est très endommagée par les bombardements de la Seconde Guerre mondiale. Pour redémarrer, Ducati fabrique un petit moteur auxiliaire à fixer sur une bicyclette : le Cucciolo, « le chiot » en italien. Dans une Italie qui doit se remettre en route, il se vend très bien. Ducati commence alors à construire des motos complètes autour.

## Taglioni et le desmodromique

En 1954 arrive l'ingénieur Fabio Taglioni. Il développe pour Ducati la distribution desmodromique : les soupapes ne sont pas refermées par des ressorts mais par un mécanisme commandé, ce qui permet de tourner plus vite sans risque d'affolement. Ce système, apparu en course sur une 125 au milieu des années 1950, deviendra la signature technique de Ducati jusqu'à aujourd'hui.

## Imola 1972 : le bicylindre en L entre dans la légende

Au début des années 1970, Taglioni dessine un bicylindre en L, à 90 degrés. En 1972, aux 200 Miles d'Imola, Paul Smart et Bruno Spaggiari terminent premier et deuxième sur des Ducati 750 face aux meilleures motos du monde. De cette victoire naît la 750 Super Sport, aujourd'hui l'une des Ducati les plus recherchées par les collectionneurs.

Autre moment fou : en 1978, Mike Hailwood, revenu à la course après des années d'absence, gagne au Tourist Trophy de l'île de Man sur une Ducati 900. Le public est en délire.

## Monster et 916 : la décennie qui change tout

En 1985, Ducati est racheté par le groupe Cagiva. Deux motos vont transformer la marque. En 1993, le Monster, dessiné par Miguel Galluzzi, est un roadster simple et musclé, sans carénage : un énorme succès, qui fera entrer beaucoup de motards dans l'univers Ducati. En 1994, la 916 de Massimo Tamburini, avec ses silencieux sous la selle et son monobras, est souvent citée comme l'une des plus belles motos jamais dessinées.

En Superbike, Ducati domine : le Britannique Carl Fogarty y gagne quatre titres mondiaux (1994, 1995, 1998, 1999), et la marque devient la référence de la catégorie.

## MotoGP et les années Audi

Ducati entre en MotoGP en 2003. En 2007, Casey Stoner offre à la marque son premier titre de champion du monde. Après des années difficiles, l'équipe redevient la référence : Francesco Bagnaia est champion du monde en 2022 et 2023, puis Jorge Martín en 2024 sur une Ducati de l'équipe Pramac.

En 2012, Ducati est rachetée par Audi, et donc par le groupe Volkswagen.

## Aujourd'hui

Ducati fabrique toujours ses motos à Borgo Panigale, où se trouvent aussi un musée et des visites d'usine. La gamme couvre les Panigale sportives, les Monster, les Multistrada, les Scrambler et les DesertX. La marque a même un festival de fans, la World Ducati Week, à Misano.$h$, $h$[{"year":"1926","text":"Création de la société à Bologne (composants radio)."},{"year":"Années 1940","text":"Après la guerre, le moteur auxiliaire Cucciolo."},{"year":"1954","text":"Arrivée de l’ingénieur Fabio Taglioni."},{"year":"1972","text":"Doublé aux 200 Miles d’Imola (Paul Smart, Bruno Spaggiari)."},{"year":"1978","text":"Mike Hailwood gagne au Tourist Trophy sur Ducati."},{"year":"1985","text":"Rachat par Cagiva."},{"year":"1993","text":"Monster."},{"year":"1994","text":"916 ; premier titre Superbike de Carl Fogarty."},{"year":"2007","text":"Casey Stoner, premier titre MotoGP de Ducati."},{"year":"2012","text":"Rachat par Audi."},{"year":"2022-2024","text":"Titres MotoGP de Francesco Bagnaia (2022, 2023) et Jorge Martín (2024)."}]$h$::jsonb, $h$[{"name":"Cucciolo","year":"Années 1940","text":"Le petit moteur auxiliaire qui a lancé Ducati dans le deux-roues."},{"name":"750 Super Sport","year":"1974","text":"Née de la victoire d’Imola, rêve de collectionneur."},{"name":"Monster","year":"1993","text":"Le roadster qui a ouvert Ducati à des milliers de motards."},{"name":"916","year":"1994","text":"Une beauté signée Tamburini, reine du Superbike."},{"name":"Panigale","year":"2011","text":"La lignée sportive actuelle."}]$h$::jsonb, $h$["Ducati a commencé par fabriquer des condensateurs pour les radios.","Le « desmo » referme les soupapes sans ressort : c’est la signature technique de la marque."]$h$::jsonb, $h$Siège et usine à Borgo Panigale (Bologne), filiale d’Audi. Gamme Panigale, Monster, Multistrada, Scrambler, DesertX. Référence en MotoGP et en Superbike.$h$, 6)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$harley-davidson$h$, $h$Harley-Davidson$h$, $h$US$h$, 1903, $h$Milwaukee, Wisconsin, États-Unis$h$, $h$William S. Harley et Arthur Davidson, rejoints par Walter et William A. Davidson$h$, $h$Du cabanon de Milwaukee au mythe du V-twin$h$, $h$Tout commence dans un petit cabanon en bois, au fond d'un jardin de Milwaukee. En 1903, deux jeunes amis, William S. Harley et Arthur Davidson, y terminent leur première moto : un vélo renforcé avec un petit moteur monocylindre. Les frères d'Arthur, Walter et William A. Davidson, les rejoignent. La marque porte depuis les deux noms de famille.

## Le V-twin et l'expansion

L'entreprise est officiellement constituée en 1907. En 1909, Harley-Davidson présente son premier bicylindre en V. Ce moteur, avec son son si particulier, deviendra l'âme de la marque. Dans les années 1910, Harley grandit à toute vitesse, fournit des motos à l'armée américaine pendant la Première Guerre mondiale et devient l'un des plus grands constructeurs du monde.

La grande rivale s'appelle Indian. Pendant des décennies, les deux marques se disputent les courses, les clients et les polices américaines. Harley traverse la crise de 1929 ; Indian, elle, arrête sa production à Springfield en 1953, et Harley reste alors le seul grand constructeur américain.

## Des moteurs qui ont des surnoms

Chez Harley, on reconnaît les époques à la forme des moteurs, et chacun a son surnom. Le Knucklehead apparaît en 1936, avec des culbuteurs qui rappellent des jointures de poing. Suivent le Panhead en 1948, aux cache-culbuteurs en forme de casserole renversée, puis le Shovelhead en 1966, l'Evolution en 1984, le Twin Cam en 1999 et le Milwaukee-Eight en 2017.

Pendant la Seconde Guerre mondiale, la WLA, robuste et simple, est produite en très grand nombre pour l'armée américaine et ses alliés. À la Libération, beaucoup de soldats découvrent la moto avec elle, et de nombreuses WLA restent en Europe.

## Easy Rider et la culture custom

En 1957 naît la Sportster, plus légère et plus sportive. En 1965, l'Electra Glide inaugure le démarreur électrique sur les grosses Harley de tourisme. Et en 1969, le film Easy Rider, avec ses choppers à moteur Panhead, fait de la Harley le symbole d'une liberté sur la route.

## AMF, le rachat et le HOG

La fin des années 1960 est difficile : Harley est rachetée en 1969 par le conglomérat AMF, et la qualité se dégrade face aux japonaises. En 1981, treize cadres, dont Willie G. Davidson, petit-fils d'un des fondateurs et responsable du style, rachètent l'entreprise. La marque se relance en jouant sur son identité, et crée en 1983 le Harley Owners Group, le club officiel des propriétaires, devenu l'un des plus grands clubs de motards au monde.

## Aujourd'hui

Harley-Davidson a toujours son siège à Milwaukee, où un grand musée lui est consacré depuis 2008. La gamme compte les Softail, les Touring, les Sportster S et Nightster, la Pan America (son premier trail, en 2021), et l'électrique a pris son propre nom, LiveWire. En France, Harley reste la référence du custom.$h$, $h$[{"year":"1903","text":"Première moto construite dans un cabanon de Milwaukee."},{"year":"1907","text":"Constitution officielle de la société."},{"year":"1909","text":"Premier bicylindre en V."},{"year":"1936","text":"Moteur Knucklehead."},{"year":"Années 1940","text":"La WLA équipe l’armée américaine."},{"year":"1948","text":"Panhead."},{"year":"1957","text":"Sportster."},{"year":"1965","text":"Electra Glide."},{"year":"1969","text":"Rachat par AMF ; sortie du film Easy Rider."},{"year":"1981","text":"Treize cadres, dont Willie G. Davidson, rachètent la marque."},{"year":"1983","text":"Création du Harley Owners Group (HOG)."},{"year":"2008","text":"Ouverture du Harley-Davidson Museum à Milwaukee."},{"year":"2021","text":"Pan America, premier trail de la marque."}]$h$::jsonb, $h$[{"name":"WLA","year":"Années 1940","text":"La moto militaire qui a fait découvrir Harley à l’Europe."},{"name":"Sportster","year":"1957","text":"La Harley plus légère, l’une des plus longues lignées de la moto."},{"name":"Electra Glide","year":"1965","text":"Le grand tourisme à l’américaine."},{"name":"Pan America","year":"2021","text":"Le premier trail Harley."}]$h$::jsonb, $h$["Les moteurs Harley ont tous un surnom : Knucklehead, Panhead, Shovelhead…","Le HOG, créé en 1983, est l’un des plus grands clubs de motards au monde."]$h$::jsonb, $h$Siège et musée à Milwaukee. Gammes Softail, Touring, Sportster, Pan America ; l’électrique est devenue une marque à part, LiveWire. Référence du custom en France.$h$, 7)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$ktm$h$, $h$KTM$h$, $h$AT$h$, 1934, $h$Mattighofen, Autriche$h$, $h$Hans Trunkenpolz, puis Ernst Kronreif comme associé$h$, $h$Ready to Race : l’orange qui a dominé le Dakar$h$, $h$KTM, ce sont trois lettres : Kraftfahrzeuge Trunkenpolz Mattighofen. En 1934, l'ingénieur Hans Trunkenpolz ouvre à Mattighofen, en Haute-Autriche, un atelier de serrurerie et de réparation automobile. Pas encore de motos : le garage vend et répare des véhicules.

## La première KTM

Il faut attendre l'après-guerre. En 1953, KTM présente sa première moto, la R100, une petite 98 cm³. L'entrepreneur Ernst Kronreif devient associé, et le nom évolue pour associer les deux hommes tout en gardant les trois lettres. La petite marque se fait connaître avec des motos légères, des cyclomoteurs et des scooters, et s'engage très tôt en compétition tout-terrain.

## Le tout-terrain dans le sang

Dans les années 1970 et 1980, KTM devient une grande marque de motocross et d'enduro. Ses motos légères et efficaces remportent de nombreux titres mondiaux. Mais l'entreprise a du mal à suivre financièrement : au début des années 1990, elle fait faillite et est découpée.

## Stefan Pierer et la renaissance orange

En 1992, l'entrepreneur Stefan Pierer reprend l'activité moto. Il fait un choix radical : rester une marque de compétition, avec une couleur, l'orange, et un slogan, « Ready to Race ». En 1994, la Duke 620 ouvre la voie des roadsters monocylindres, puis viennent les gros bicylindres : Adventure, Super Duke, et plus tard les petites Duke et RC fabriquées en partenariat avec l'indien Bajaj, qui deviendront des best-sellers chez les jeunes motards.

## Le règne sur le Dakar

Au Dakar, KTM réalise une série unique : la marque gagne la catégorie moto à chaque édition de 2001 à 2019. Des pilotes comme Fabrizio Meoni, Cyril Despres, Marc Coma, ou plus tard Toby Price et Sam Sunderland, offrent à l'orange une domination sans équivalent.

## MotoGP et groupe

KTM entre en MotoGP en 2017. En 2020, Brad Binder lui offre sa première victoire, au Grand Prix de République tchèque à Brno. Entre-temps, KTM rachète Husqvarna en 2013, puis GasGas en 2019, et forme un groupe européen de la moto.

## Aujourd'hui

Le siège est toujours à Mattighofen. Fin 2024, le groupe a traversé une grave crise financière et une procédure de restructuration. La gamme va des 125 Duke aux 1390 Super Duke, des Adventure aux motos de motocross et d'enduro, et la marque reste l'une des plus titrées en tout-terrain.$h$, $h$[{"year":"1934","text":"Hans Trunkenpolz ouvre son atelier à Mattighofen."},{"year":"1953","text":"Première moto KTM, la R100."},{"year":"Années 1970-1980","text":"Titres mondiaux en motocross et enduro."},{"year":"1991-1992","text":"Faillite ; reprise de l’activité moto par Stefan Pierer."},{"year":"1994","text":"Duke 620."},{"year":"2001","text":"Première d’une série de victoires au Dakar, jusqu’en 2019."},{"year":"2013","text":"Rachat de Husqvarna."},{"year":"2017","text":"Arrivée en MotoGP."},{"year":"2020","text":"Première victoire en MotoGP (Brad Binder, Brno)."},{"year":"2024","text":"Grave crise financière et restructuration."}]$h$::jsonb, $h$[{"name":"R100","year":"1953","text":"La toute première KTM."},{"name":"Duke 620","year":"1994","text":"Le monocylindre routier qui a lancé la gamme Duke."},{"name":"950 / 990 Adventure","year":"2003","text":"Les gros trails nés des victoires au Dakar."},{"name":"1290 Super Duke R","year":"2014","text":"Le roadster surnommé « The Beast »."}]$h$::jsonb, $h$["KTM signifie Kraftfahrzeuge Trunkenpolz Mattighofen.","De 2001 à 2019, KTM a gagné toutes les éditions du Dakar à moto."]$h$::jsonb, $h$Siège à Mattighofen (Autriche). Groupe avec Husqvarna et GasGas. Restructuration après la crise financière de fin 2024. Gamme Duke, Adventure, RC, tout-terrain.$h$, 9)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$royal-enfield$h$, $h$Royal Enfield$h$, $h$IN$h$, 1901, $h$Redditch, Angleterre ; aujourd’hui Chennai, Inde$h$, $h$Issue de George Townsend & Co. (aiguilles, puis bicyclettes) à Redditch$h$, $h$La Bullet, de Redditch à Chennai$h$, $h$Royal Enfield est une marque anglaise devenue indienne, et c'est justement ce qui l'a sauvée. Son histoire commence à Redditch, dans les Midlands, une ville spécialisée dans les aiguilles et les hameçons. À la fin du XIXe siècle, l'entreprise passe aux bicyclettes, sous le nom d'Enfield, puis Royal Enfield, en lien avec des fournitures pour la Royal Small Arms Factory d'Enfield. Sa devise vient de là : « Made like a gun », solide comme un fusil.

## La Bullet, une moto qui ne meurt jamais

La première moto Royal Enfield date de 1901. Pendant la première moitié du siècle, la marque produit des motos solides, utilisées notamment par l'armée pendant les deux guerres mondiales. En 1932 apparaît la Bullet, une monocylindre quatre-temps. Ce nom traversera tout le siècle.

## Le contrat indien

Au milieu des années 1950, l'armée indienne choisit la Bullet 350 pour ses patrouilles aux frontières. Pour la produire sur place, une société indienne est créée à Madras (aujourd'hui Chennai), qui assemble d'abord des motos venues d'Angleterre puis les fabrique entièrement.

En Angleterre, Royal Enfield subit le même sort que les autres marques britanniques face aux japonaises, et la production s'arrête à la fin des années 1960. Mais en Inde, la Bullet continue, presque inchangée, pendant des décennies. Elle devient la moto des longs voyages, des montagnes de l'Himalaya, des policiers et des passionnés.

## Eicher et le grand retour

En 1994, le groupe indien Eicher rachète l'entreprise, qui reprend le nom de Royal Enfield. Le début des années 2000 est difficile, puis la marque se modernise : nouveaux moteurs à injection, meilleure qualité, design néo-rétro assumé. La Classic 350 devient un énorme succès en Inde.

En 2016, la Himalayan, un trail simple et robuste, séduit les voyageurs du monde entier. En 2018, les bicylindres Interceptor 650 et Continental GT 650 marquent le retour de Royal Enfield en Europe : des motos à l'esprit anglais des années 1960, à prix doux, accessibles aux permis A2.

## Aujourd'hui

Royal Enfield est basée à Chennai et possède un centre technique en Angleterre. Elle se présente comme la plus ancienne marque de motos encore en production. La gamme comprend Classic, Hunter, Meteor, Himalayan, Interceptor, Continental GT, Super Meteor et Shotgun, et la marque est devenue l'une des plus vendues au monde dans les cylindrées moyennes.$h$, $h$[{"year":"Fin du XIXe siècle","text":"À Redditch, l’entreprise passe des aiguilles aux bicyclettes."},{"year":"1901","text":"Première moto Royal Enfield."},{"year":"1932","text":"Naissance de la Bullet."},{"year":"Années 1950","text":"L’armée indienne choisit la Bullet 350 ; production lancée à Madras (Chennai)."},{"year":"Fin des années 1960","text":"Arrêt de la production en Angleterre."},{"year":"1994","text":"Rachat par le groupe Eicher."},{"year":"2016","text":"Himalayan."},{"year":"2018","text":"Interceptor 650 et Continental GT 650."}]$h$::jsonb, $h$[{"name":"Bullet","year":"1932","text":"L’un des plus longs noms de modèle de l’histoire de la moto."},{"name":"Classic 350","year":"Années 2000","text":"Le succès qui a relancé la marque en Inde."},{"name":"Himalayan","year":"2016","text":"Le trail simple fait pour la montagne."},{"name":"Interceptor 650","year":"2018","text":"Le bicylindre néo-rétro accessible aux A2."}]$h$::jsonb, $h$["La devise historique « Made like a gun » rappelle le lien avec la manufacture d’armes d’Enfield.","La Bullet a été fabriquée en Inde quasiment sans changement pendant des décennies."]$h$::jsonb, $h$Basée à Chennai (Inde), groupe Eicher, centre technique en Angleterre. Gamme 350, 450 et 650, très accessible aux permis A2 en France.$h$, 10)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$peugeot$h$, $h$Peugeot Motocycles$h$, $h$FR$h$, 1898, $h$Pays de Montbéliard (Doubs), France$h$, $h$La famille Peugeot$h$, $h$Le lion, les courses de 1905 et le 103 de toute une génération$h$, $h$Pour beaucoup de Français, le premier deux-roues à moteur avait un lion sur le réservoir. Peugeot est l'un des plus anciens noms de l'industrie française : au début du XIXe siècle, la famille Peugeot transforme un moulin du pays de Montbéliard en fonderie d'acier. On y fabrique des scies, des outils, des moulins à café, puis des baleines de corsets et des bicyclettes. Le lion, symbole de la solidité des lames, devient la marque de la maison.

## Les premières motos et la course

À la fin des années 1890, Peugeot passe au deux-roues à moteur. Au début du XXe siècle, les motos Peugeot brillent dans les grandes courses de l'époque, comme le Tour de France motocycliste de 1905.

La marque marque aussi l'histoire d'une course anglaise : lors du tout premier Tourist Trophy de l'île de Man, en 1907, la catégorie bicylindre est gagnée par Rem Fowler sur une Norton… équipée d'un moteur bicylindre en V Peugeot.

## La France à cyclomoteur

Après la Seconde Guerre mondiale, la France a besoin de se déplacer à petit prix. Peugeot produit des motos légères, des scooters, puis surtout des cyclomoteurs. En 1971 apparaît le 103, un cyclomoteur simple, léger et facile à bricoler. Il devient l'un des deux-roues les plus populaires de France : des générations d'adolescents ont appris la mécanique en démontant un 103, souvent au grand désespoir de leurs parents.

## Le temps des scooters

À partir des années 1990, le scooter remplace peu à peu le cyclomoteur. Peugeot suit le mouvement avec des modèles devenus très courants dans les villes françaises, comme le Speedfight, puis des scooters plus rétro comme le Django. En 2013, le Metropolis, scooter à trois roues, montre que la marque sait encore innover.

## Une histoire de propriétaires

Peugeot Motocycles est longtemps restée dans le giron du groupe automobile PSA. Le groupe indien Mahindra en devient actionnaire en 2015, puis le seul propriétaire. Plus récemment, la société a encore changé d'actionnaire principal, tout en restant installée dans le Doubs.

## Aujourd'hui

Peugeot Motocycles conçoit des scooters et des deux-roues urbains, dont des modèles électriques, depuis son site historique du Doubs. Le lion, lui, continue de rouler dans toutes les villes de France.$h$, $h$[{"year":"Début du XIXe siècle","text":"La famille Peugeot fonde une fonderie d’acier dans le pays de Montbéliard."},{"year":"Fin des années 1890","text":"Premiers deux-roues à moteur Peugeot."},{"year":"1905","text":"Les Peugeot au Tour de France motocycliste."},{"year":"1907","text":"Une Norton à moteur Peugeot gagne la catégorie bicylindre du premier TT."},{"year":"1971","text":"Lancement du cyclomoteur 103."},{"year":"2013","text":"Metropolis, scooter à trois roues."},{"year":"2015","text":"Mahindra entre au capital."}]$h$::jsonb, $h$[{"name":"Motos de course","year":"Années 1900","text":"Les bicylindres qui ont brillé dans les courses de l’époque."},{"name":"103","year":"1971","text":"Le cyclomoteur d’une génération entière de Français."},{"name":"Speedfight","year":"Années 1990","text":"Le scooter sportif des années lycée."},{"name":"Metropolis","year":"2013","text":"Le scooter à trois roues de la marque."}]$h$::jsonb, $h$["Avant les motos, Peugeot fabriquait des scies, des outils et des moulins à café.","Le moteur de la Norton victorieuse au premier Tourist Trophy, en 1907, était un Peugeot."]$h$::jsonb, $h$Scooters et deux-roues urbains, dont électriques, conçus dans le Doubs. Le 103 reste une icône des collectionneurs.$h$, 11)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$moto-guzzi$h$, $h$Moto Guzzi$h$, $h$IT$h$, 1921, $h$Mandello del Lario, lac de Côme, Italie$h$, $h$Carlo Guzzi et Giorgio Parodi$h$, $h$L’aigle de Mandello et son V-twin transversal$h$, $h$L'histoire de Moto Guzzi commence pendant la Première Guerre mondiale, dans l'aviation militaire italienne. Trois jeunes hommes s'y rencontrent : Carlo Guzzi, mécanicien, Giorgio Parodi, fils d'armateur génois, et Giovanni Ravelli, pilote. Ils se promettent de fonder ensemble une marque de motos après la guerre.

## Une promesse et un aigle

Giovanni Ravelli meurt en 1919 dans un accident d'avion, avant que le projet ne voie le jour. En 1921, Carlo Guzzi et Giorgio Parodi fondent la société à Mandello del Lario, au bord du lac de Côme. En hommage à leur ami aviateur, ils choisissent un aigle aux ailes déployées comme emblème. Un siècle plus tard, l'aigle est toujours là, et l'usine aussi : Moto Guzzi est l'une des plus anciennes marques européennes à produire sans interruption au même endroit.

## La course et la soufflerie

Dans les années 1920 à 1950, Moto Guzzi est une grande marque de course. Ses motos gagnent au Tourist Trophy et en championnat du monde. En 1950, la marque construit une soufflerie à Mandello pour étudier l'aérodynamique de ses motos, une rareté absolue à l'époque.

Le sommet technique s'appelle l'Otto Cilindri : une 500 de Grand Prix à moteur V8, développée au milieu des années 1950 sous la direction de l'ingénieur Giulio Cesare Carcano. Elle était si en avance qu'elle reste une légende. Fin 1957, Moto Guzzi se retire des Grands Prix, comme d'autres marques italiennes.

## Le V-twin transversal

Dans les années 1960, Moto Guzzi conçoit un bicylindre en V à 90 degrés, monté en travers du cadre, les cylindres dépassant de chaque côté, avec une transmission par cardan. En 1967, la V7 l'adopte. Ce moteur, très reconnaissable, devient l'identité de la marque. Il équipe aussi des motos de police et d'administration en Italie et ailleurs.

En 1976, la 850 Le Mans, sportive rapide au style tranchant, devient l'une des Guzzi les plus désirées. Les V7 modernes et les California custom prolongent la lignée.

## Des propriétaires successifs

Comme beaucoup de marques italiennes, Moto Guzzi change plusieurs fois de mains : l'industriel Alejandro de Tomaso dans les années 1970, puis Aprilia en 2000, et enfin le groupe Piaggio en 2004.

## Aujourd'hui

Moto Guzzi appartient au groupe Piaggio et fabrique toujours ses motos à Mandello del Lario, où l'usine accueille un musée. La marque a fêté ses cent ans en 2021. La gamme comprend les V7, V85 TT, V100 Mandello et Stelvio, toutes fidèles au V-twin transversal.$h$, $h$[{"year":"1919","text":"Mort de l’aviateur Giovanni Ravelli, ami des fondateurs."},{"year":"1921","text":"Fondation à Mandello del Lario par Carlo Guzzi et Giorgio Parodi."},{"year":"1950","text":"Construction d’une soufflerie à Mandello."},{"year":"Milieu des années 1950","text":"L’Otto Cilindri, 500 de Grand Prix à moteur V8."},{"year":"1957","text":"Retrait des Grands Prix."},{"year":"1967","text":"V7, premier V-twin transversal."},{"year":"1976","text":"850 Le Mans."},{"year":"2004","text":"Intégration au groupe Piaggio."},{"year":"2021","text":"Centenaire de la marque."}]$h$::jsonb, $h$[{"name":"Otto Cilindri","year":"Années 1950","text":"La 500 de Grand Prix à moteur V8, légende technique."},{"name":"V7","year":"1967","text":"Le premier V-twin transversal, base de toute la gamme."},{"name":"850 Le Mans","year":"1976","text":"La sportive culte de Mandello."},{"name":"V85 TT","year":"2019","text":"Le trail néo-rétro de la marque."}]$h$::jsonb, $h$["L’aigle de Moto Guzzi rend hommage à Giovanni Ravelli, aviateur mort avant la fondation.","Moto Guzzi avait une soufflerie dès 1950."]$h$::jsonb, $h$Groupe Piaggio, usine et musée à Mandello del Lario. Gamme V7, V85 TT, V100 Mandello, Stelvio.$h$, 12)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$indian$h$, $h$Indian$h$, $h$US$h$, 1901, $h$Springfield, Massachusetts, États-Unis$h$, $h$George M. Hendee et Carl Oscar Hedstrom$h$, $h$La plus ancienne marque américaine et le record de Burt Munro$h$, $h$Avant Harley-Davidson, il y avait Indian. En 1901, à Springfield, dans le Massachusetts, George M. Hendee, ancien champion cycliste devenu fabricant de bicyclettes, s'associe à Carl Oscar Hedstrom, un mécanicien d'origine suédoise. Ensemble, ils construisent une bicyclette à moteur fiable et performante. La marque Indian est née, et c'est aujourd'hui la plus ancienne marque de motos américaine.

## Les années glorieuses

Dans les années 1910, Indian est l'un des plus grands constructeurs du monde. Ses motos sont modernes, rapides, et gagnent beaucoup de courses. En 1911, Indian réalise un exploit retentissant au Tourist Trophy de l'île de Man : ses pilotes prennent les trois premières places de la course principale. Une marque américaine qui gagne en Europe, c'était du jamais vu.

## Scout et Chief

En 1920, Indian lance la Scout, un bicylindre en V conçu par Charles B. Franklin, agile et robuste. Deux ans plus tard arrive la Chief, plus grosse, faite pour avaler les distances. Vers 1940, la Chief adopte ses grands garde-boue enveloppants, devenus l'un des signes distinctifs de la marque. Indian propose aussi des quatre-cylindres en ligne, héritées du rachat de la marque Ace.

La rivalité avec Harley-Davidson est totale : sur les circuits, auprès des polices et des armées, et dans le cœur des motards.

## La fin de Springfield et l'Indian de Burt Munro

Après la Seconde Guerre mondiale, Indian traverse de grosses difficultés. En 1953, la production s'arrête à Springfield. Pendant des décennies, le nom passe de main en main, avec des tentatives de relance plus ou moins sérieuses.

Pendant ce temps, à l'autre bout du monde, un Néo-Zélandais transforme une vieille Indian Scout de 1920 dans son garage. Burt Munro passe des années à la modifier, et en 1967, sur le lac salé de Bonneville, il établit un record du monde de vitesse dans la catégorie des moins de 1 000 cm³, toujours valable aujourd'hui. Son histoire est racontée dans le film The World's Fastest Indian (2005), avec Anthony Hopkins.

## La renaissance avec Polaris

En 2011, le groupe américain Polaris rachète Indian. En 2013, la nouvelle Chief est présentée au grand rassemblement de Sturgis, puis viennent la Scout, la Chieftain, la Roadmaster et la FTR, inspirée des motos de flat-track. En course, Indian domine le championnat américain de flat-track avec sa FTR750.

## Aujourd'hui

Indian fait partie du groupe Polaris et produit ses motos aux États-Unis. La gamme custom et touring, avec les Scout, Chief, Chieftain et Pursuit, en fait la grande rivale de Harley-Davidson, comme il y a cent ans.$h$, $h$[{"year":"1901","text":"Hendee et Hedstrom créent Indian à Springfield."},{"year":"1911","text":"Triplé au Tourist Trophy de l’île de Man."},{"year":"1920","text":"Indian Scout."},{"year":"1922","text":"Indian Chief."},{"year":"1953","text":"Arrêt de la production à Springfield."},{"year":"1967","text":"Burt Munro, record de vitesse à Bonneville sur sa Scout de 1920."},{"year":"2005","text":"Film The World’s Fastest Indian."},{"year":"2011","text":"Rachat par Polaris."},{"year":"2013","text":"Nouvelle Chief présentée à Sturgis."}]$h$::jsonb, $h$[{"name":"Scout","year":"1920","text":"Le V-twin agile de Charles B. Franklin, et la base du record de Burt Munro."},{"name":"Chief","year":"1922","text":"La grosse Indian, reconnaissable à ses garde-boue enveloppants."},{"name":"Four","year":"Années 1930","text":"Le quatre-cylindres en ligne hérité d’Ace."},{"name":"FTR","year":"2019","text":"Le roadster inspiré du flat-track."}]$h$::jsonb, $h$["Indian est la plus ancienne marque de motos américaine, deux ans avant Harley-Davidson.","Le record de Burt Munro a été établi sur une moto de 1920 qu’il avait transformée lui-même."]$h$::jsonb, $h$Groupe Polaris, production aux États-Unis. Gamme Scout, Chief, Chieftain, Pursuit, FTR.$h$, 13)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$aprilia$h$, $h$Aprilia$h$, $h$IT$h$, 1945, $h$Noale, près de Venise, Italie$h$, $h$Alberto Beggio ; l’essor vient de son fils Ivano Beggio$h$, $h$Des bicyclettes de Noale aux titres mondiaux$h$, $h$Aprilia est née après la Seconde Guerre mondiale à Noale, près de Venise, où Alberto Beggio fabrique des bicyclettes. L'entreprise reste modeste jusqu'à ce que son fils, Ivano Beggio, prenne les commandes à la fin des années 1960 et la lance dans le deux-roues à moteur.

## Cyclomoteurs, cross et petite cylindrée

Les premiers Aprilia à moteur sont des cyclomoteurs et des motos de motocross. Aprilia se fait une spécialité des petites cylindrées sportives, très appréciées des jeunes Italiens, et plus tard des scooters. La RS 125, avec son allure de vraie moto de course, deviendra un rêve d'adolescent dans toute l'Europe, France comprise.

## La fabrique de champions

C'est en Grand Prix que la petite marque devient grande. Dans les catégories 125 et 250, Aprilia aligne les titres mondiaux. Max Biaggi est champion du monde 250 avec Aprilia en 1994, 1995 et 1996. Valentino Rossi y remporte son titre 125 en 1997 et son titre 250 en 1999, avant de passer dans la catégorie reine. Beaucoup de grands pilotes ont fait leurs classes sur une Aprilia.

## Les grosses cylindrées

En 1998, Aprilia lance la RSV Mille, une sportive à bicylindre en V, puis la Tuono, sa version roadster. En 2000, la marque rachète Moto Guzzi et Laverda, mais l'effort financier est trop lourd. En 2004, Aprilia rejoint le groupe Piaggio.

En 2009 arrive la RSV4, une sportive à moteur V4. Elle offre à Max Biaggi deux titres de champion du monde Superbike, en 2010 et 2012. Le V4 devient la nouvelle signature de la marque.

## MotoGP

Aprilia revient en MotoGP avec sa propre équipe d'usine. En 2022, Aleix Espargaró offre à la marque sa première victoire dans la catégorie, au Grand Prix d'Argentine. D'autres victoires suivent.

## Aujourd'hui

Aprilia appartient au groupe Piaggio et reste basée à Noale. La gamme comprend les RSV4 et Tuono V4, les RS et Tuono 660, le trail Tuareg 660 et des 125 sportives toujours prisées des jeunes motards.$h$, $h$[{"year":"1945","text":"Alberto Beggio fabrique des bicyclettes à Noale."},{"year":"Fin des années 1960","text":"Ivano Beggio lance Aprilia dans le deux-roues à moteur."},{"year":"1994-1996","text":"Max Biaggi, trois titres mondiaux 250."},{"year":"1997","text":"Valentino Rossi champion du monde 125 sur Aprilia."},{"year":"1998","text":"RSV Mille."},{"year":"1999","text":"Valentino Rossi champion du monde 250 sur Aprilia."},{"year":"2000","text":"Rachat de Moto Guzzi et Laverda."},{"year":"2004","text":"Intégration au groupe Piaggio."},{"year":"2009","text":"RSV4."},{"year":"2010 et 2012","text":"Max Biaggi champion du monde Superbike."},{"year":"2022","text":"Première victoire en MotoGP (Aleix Espargaró, Argentine)."}]$h$::jsonb, $h$[{"name":"RS 125","year":"Années 1990","text":"La petite sportive qui faisait rêver les adolescents."},{"name":"RSV Mille","year":"1998","text":"La première grosse sportive Aprilia."},{"name":"RSV4","year":"2009","text":"Le V4 championne du monde Superbike."},{"name":"Tuareg 660","year":"2022","text":"Le trail inspiré du rallye."}]$h$::jsonb, $h$["Valentino Rossi a gagné ses titres 125 et 250 sur Aprilia.","La petite marque de Noale a racheté Moto Guzzi en 2000."]$h$::jsonb, $h$Groupe Piaggio, siège à Noale. RSV4, Tuono, RS 660, Tuareg 660 et 125 sportives. Équipe d’usine en MotoGP.$h$, 14)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$mv-agusta$h$, $h$MV Agusta$h$, $h$IT$h$, 1945, $h$Cascina Costa (Samarate), près de Varèse, Italie$h$, $h$Le comte Domenico Agusta$h$, $h$Les records d’Agostini et des motos comme des bijoux$h$, $h$MV Agusta, c'est Meccanica Verghera Agusta, du nom du hameau de Verghera, près de Varèse. La famille Agusta est d'abord une famille de l'aviation : Giovanni Agusta construit des avions dès les années 1920. Après la Seconde Guerre mondiale, son fils, le comte Domenico Agusta, crée en 1945 une branche moto pour faire travailler les ouvriers de l'usine aéronautique.

## Une 98 qui ne pouvait pas s'appeler Vespa

La première moto de la marque est une petite 98 cm³. Elle devait s'appeler « Vespa », mais le nom était déjà pris par le célèbre scooter de Piaggio. Elle s'appellera donc simplement MV 98. Le début est modeste ; la suite le sera beaucoup moins.

## La marque la plus titrée de l'histoire des Grands Prix

Domenico Agusta est un passionné de course, et il y consacre des moyens énormes. Dans les années 1950 à 1970, les MV Agusta rouges et argent dominent les Grands Prix, surtout dans les catégories 350 et 500. De grands champions s'y succèdent : John Surtees, Mike Hailwood, Phil Read, et surtout Giacomo Agostini.

Agostini remporte avec MV Agusta 13 de ses 15 titres de champion du monde, dont sept titres 500 consécutifs de 1966 à 1972. MV Agusta compte parmi les constructeurs les plus titrés de l'histoire des Grands Prix.

## La 750 S, un rêve de route

Sur route, MV Agusta produit peu, mais des machines exceptionnelles. En 1971 apparaît la 750 S, un quatre-cylindres sportif dérivé de la course, très cher et très exclusif. Elle est aujourd'hui l'une des motos de collection les plus recherchées.

Domenico Agusta meurt en 1971. Sans lui, la passion de la course s'éteint peu à peu, l'entreprise se recentre sur les hélicoptères, et la production de motos s'arrête à la fin des années 1970.

## La renaissance par Cagiva et la F4

Au début des années 1990, le groupe Cagiva des frères Castiglioni rachète le nom. En 1997, la F4 750, dessinée par Massimo Tamburini, le père de la Ducati 916, fait sensation : une sportive à quatre cylindres d'une beauté rare. Suivent les Brutale, des roadsters tout aussi soignés.

## Aujourd'hui

MV Agusta a changé plusieurs fois de propriétaires depuis les années 2000, tout en restant installée à Varèse. Elle produit des motos haut de gamme à trois et quatre cylindres, comme les Superveloce, Brutale, Dragster et Enduro Veloce, en petites séries.$h$, $h$[{"year":"1945","text":"Le comte Domenico Agusta crée la branche moto."},{"year":"1945-1946","text":"Première moto, la MV 98."},{"year":"1958-1960","text":"John Surtees, champion du monde 350 et 500."},{"year":"1966-1972","text":"Giacomo Agostini, sept titres 500 consécutifs."},{"year":"1971","text":"750 S ; mort de Domenico Agusta."},{"year":"Fin des années 1970","text":"Arrêt de la production de motos."},{"year":"Début des années 1990","text":"Le groupe Cagiva rachète la marque."},{"year":"1997","text":"F4 750 de Massimo Tamburini."}]$h$::jsonb, $h$[{"name":"MV 98","year":"1945-1946","text":"La première MV, qui ne pouvait pas s’appeler Vespa."},{"name":"500 Tre Cilindri","year":"Années 1960","text":"La moto de Grand Prix des titres d’Agostini."},{"name":"750 S","year":"1971","text":"Le quatre-cylindres de route, bijou de collection."},{"name":"F4","year":"1997","text":"La sportive de Tamburini qui a ressuscité la marque."}]$h$::jsonb, $h$["La première MV devait s’appeler Vespa, mais Piaggio avait déjà le nom.","Giacomo Agostini a gagné 13 de ses 15 titres mondiaux sur MV Agusta."]$h$::jsonb, $h$Basée à Varèse. Motos haut de gamme en petites séries : Superveloce, Brutale, Dragster, Enduro Veloce.$h$, 15)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$husqvarna$h$, $h$Husqvarna$h$, $h$SE$h$, 1689, $h$Huskvarna, Suède (manufacture d’armes) ; motos depuis 1903$h$, $h$Manufacture d’armes royale de Huskvarna$h$, $h$D’une manufacture d’armes de 1689 aux titres de motocross$h$, $h$Husqvarna est sans doute la marque de motos qui a la plus longue histoire industrielle. Tout commence en 1689, dans la ville suédoise de Huskvarna, avec une manufacture d'armes. Au fil des siècles, l'entreprise se diversifie : machines à coudre, outils, appareils de cuisine… et bicyclettes à partir de la fin du XIXe siècle.

## La première moto en 1903

En 1903, Husqvarna construit sa première moto, avec un moteur acheté à l'extérieur. Pendant les années 1920 et 1930, la marque développe ses propres moteurs et s'engage en Grand Prix sur route avec des bicylindres en V. Les Husqvarna de course des années 1930 se battent avec les meilleures machines européennes.

## Les rois du motocross

Mais c'est dans la boue que Husqvarna devient une légende. À la fin des années 1950, la marque se tourne vers le motocross avec des motos légères à moteur deux-temps, beaucoup plus maniables que les lourdes quatre-temps britanniques de l'époque. Le Suédois Torsten Hallman devient champion du monde 250 sur Husqvarna en 1962 et 1963, puis encore en 1966 et 1967. Les titres s'enchaînent, en motocross comme en enduro.

## Steve McQueen et On Any Sunday

Aux États-Unis, Husqvarna devient la moto de tout-terrain à la mode. L'acteur Steve McQueen, grand passionné de moto, roule sur Husqvarna dans le documentaire On Any Sunday (1971), et pose même avec elle en couverture d'un grand magazine sportif américain. L'image du « Husky » est faite pour longtemps.

## Italie, puis Allemagne, puis Autriche

En 1987, la branche moto est vendue au groupe italien Cagiva, et la production quitte la Suède pour Varèse, en Italie. Les machines restent des références en enduro et en motocross. En 2007, BMW rachète la marque, sans réussir à la relancer vraiment. En 2013, Husqvarna Motorcycles passe sous le contrôle de Stefan Pierer, le patron de KTM, et rejoint le groupe autrichien.

Attention à ne pas confondre : les tronçonneuses et outils de jardin Husqvarna appartiennent à une autre entreprise suédoise, distincte des motos.

## Aujourd'hui

Husqvarna Motorcycles fait partie du groupe de KTM, à Mattighofen. La marque a relancé des motos de route au design original, les Vitpilen (« flèche blanche ») et Svartpilen (« flèche noire »), à côté de ses motos de motocross et d'enduro.$h$, $h$[{"year":"1689","text":"Création de la manufacture d’armes de Huskvarna."},{"year":"Fin du XIXe siècle","text":"Premières bicyclettes."},{"year":"1903","text":"Première moto Husqvarna."},{"year":"Années 1930","text":"Engagement en Grand Prix sur route."},{"year":"1962-1963","text":"Torsten Hallman, champion du monde de motocross 250."},{"year":"1971","text":"Steve McQueen sur Husqvarna dans On Any Sunday."},{"year":"1987","text":"Rachat par Cagiva ; production en Italie."},{"year":"2007","text":"Rachat par BMW."},{"year":"2013","text":"Rejoint le groupe de KTM."}]$h$::jsonb, $h$[{"name":"Course 500 cm³","year":"Années 1930","text":"Les bicylindres de Grand Prix de l’avant-guerre."},{"name":"Motocross deux-temps","year":"Années 1960","text":"Les machines légères des titres de Torsten Hallman."},{"name":"Vitpilen / Svartpilen","year":"2018","text":"Les routières néo-rétro « flèche blanche » et « flèche noire »."}]$h$::jsonb, $h$["Husqvarna a d’abord fabriqué des armes, dès 1689.","Les tronçonneuses Husqvarna et les motos Husqvarna sont aujourd’hui deux entreprises différentes."]$h$::jsonb, $h$Groupe KTM (Mattighofen, Autriche). Motocross, enduro et routières Vitpilen / Svartpilen.$h$, 16)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$benelli$h$, $h$Benelli$h$, $h$IT$h$, 1911, $h$Pesaro, Italie$h$, $h$Teresa Benelli et ses six fils$h$, $h$Une mère, six fils et la première six-cylindres de série$h$, $h$L'histoire de Benelli commence avec une mère de famille. En 1911, à Pesaro, sur la côte adriatique, Teresa Benelli, veuve, investit ses économies pour ouvrir un atelier de réparation où travailleront ses six fils : Giuseppe, Giovanni, Francesco, Filippo, Domenico et Antonio, que tout le monde appelle Tonino.

## Des réparations aux motos de course

L'atelier répare des voitures, des motos et des armes, puis fabrique ses propres pièces. Au début des années 1920, les frères construisent leur premier moteur, puis leurs premières motos. Le plus jeune, Tonino, se révèle un pilote exceptionnel : il remporte plusieurs titres de champion d'Italie à la fin des années 1920. Sa carrière s'arrête après un accident, et il meurt en 1937 dans un accident de la route.

Benelli devient une marque de course réputée. En 1939, Ted Mellors gagne la course Lightweight du Tourist Trophy de l'île de Man sur une Benelli 250.

## Titres mondiaux

Après la guerre, Benelli remporte deux titres de champion du monde 250 : avec l'Italien Dario Ambrosini en 1950, puis avec l'Australien Kel Carruthers en 1969. Entre-temps, Giuseppe Benelli quitte l'entreprise familiale en 1949 et fonde sa propre marque à Pesaro, Motobi.

## La 750 Sei, six cylindres en ligne

En 1971, l'industriel Alejandro de Tomaso rachète Benelli. Sous son impulsion naît la 750 Sei, présentée au début des années 1970 : la première moto de série à moteur six-cylindres en ligne. Avec ses six pots d'échappement, elle fait sensation. Mais les années suivantes sont difficiles, et la marque décline.

## Renaissance italienne, puis chinoise

En 1995, l'industriel Andrea Merloni relance Benelli, avec notamment la Tornado Tre 900, une sportive à trois cylindres. En 2005, Benelli est rachetée par le groupe chinois Qianjiang (QJ), qui garde un centre de recherche et de design à Pesaro.

## Aujourd'hui

Benelli conçoit ses motos à Pesaro et les fait produire en Chine. Avec des modèles accessibles comme le trail TRK 502 et les Leoncino, elle est redevenue l'une des marques les plus vendues en Italie et se fait une place en France, notamment auprès des permis A2.$h$, $h$[{"year":"1911","text":"Teresa Benelli ouvre l’atelier familial à Pesaro."},{"year":"Début des années 1920","text":"Premier moteur et premières motos Benelli."},{"year":"1939","text":"Ted Mellors gagne la course Lightweight du Tourist Trophy."},{"year":"1949","text":"Giuseppe Benelli fonde Motobi."},{"year":"1950","text":"Dario Ambrosini champion du monde 250."},{"year":"1969","text":"Kel Carruthers champion du monde 250."},{"year":"1971","text":"Rachat par Alejandro de Tomaso."},{"year":"Années 1970","text":"750 Sei, première six-cylindres de série."},{"year":"2005","text":"Rachat par le groupe chinois Qianjiang."}]$h$::jsonb, $h$[{"name":"250 de course","year":"Années 1930-1950","text":"Les machines du TT 1939 et du titre de 1950."},{"name":"750 Sei","year":"Années 1970","text":"La première moto de série à six cylindres."},{"name":"Tornado Tre 900","year":"Début des années 2000","text":"La sportive trois-cylindres de la renaissance."},{"name":"TRK 502","year":"2016","text":"Le trail accessible devenu best-seller en Italie."}]$h$::jsonb, $h$["Benelli a été fondée par une mère pour donner un métier à ses six fils.","La 750 Sei a six pots d’échappement, trois de chaque côté."]$h$::jsonb, $h$Groupe Qianjiang (Chine), design et recherche à Pesaro. Gamme TRK, Leoncino, 125 à 800 cm³.$h$, 17)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$norton$h$, $h$Norton$h$, $h$GB$h$, 1898, $h$Birmingham, Angleterre$h$, $h$James Lansdowne Norton$h$, $h$Featherbed, Manx et Commando : la course dans le sang$h$, $h$En 1898, à Birmingham, James Lansdowne Norton fonde une entreprise qui fabrique des pièces pour l'industrie du cycle. Quelques années plus tard, en 1902, il commence à construire des motos avec des moteurs achetés à l'extérieur. La suite sera écrite sur les circuits.

## 1907 : une victoire au premier Tourist Trophy

Lors du tout premier Tourist Trophy de l'île de Man, en 1907, la catégorie bicylindre est remportée par Rem Fowler sur une Norton à moteur Peugeot. Pour la jeune marque, c'est le début d'une longue histoire d'amour avec le TT, où Norton s'imposera de très nombreuses fois.

James Norton, surnommé « Pa » Norton, meurt en 1925, mais la marque est déjà lancée. Dans les années 1920 et 1930, ses monocylindres de course, les CS1 puis les International, dominent les courses britanniques et européennes.

## Le Featherbed et la Manx

En 1950, Norton adopte un nouveau cadre conçu par les frères McCandless, d'Irlande du Nord. Il est si confortable et si efficace qu'on le surnomme le « Featherbed », le lit de plumes. Montée sur ce cadre, la Manx, monocylindre de course vendue aux pilotes privés, devient la référence des circuits pendant des années. En 1951, le Britannique Geoff Duke est champion du monde 350 et 500 sur Norton.

Le cadre Featherbed devient lui-même une légende : on le retrouvera sur des motos de route Norton, et des préparateurs y installeront des moteurs Triumph pour créer les célèbres « Triton », emblèmes de la culture café racer.

## La Commando

En 1967, Norton présente la Commando, un bicylindre de 750 cm³ dont le moteur est relié au cadre par des silentblocs (système « Isolastic ») pour filtrer les vibrations. Rapide, belle, elle est élue plusieurs fois moto de l'année en Angleterre. Mais l'industrie britannique s'effondre face aux japonaises, et Norton est fusionnée en 1973 avec Triumph et BSA au sein de Norton-Villiers-Triumph, qui disparaîtra quelques années plus tard.

## Le moteur rotatif

Dans les années 1980, la marque survit avec des motos à moteur rotatif, de type Wankel, utilisées notamment par la police britannique. En 1992, le pilote écossais Steve Hislop gagne le Senior TT sur une Norton à moteur rotatif, l'une des victoires les plus émouvantes de l'histoire de l'île.

## Aujourd'hui

Après plusieurs relances et une faillite en 2020, Norton est rachetée la même année par le groupe indien TVS Motor. La marque s'installe dans une nouvelle usine à Solihull, près de Birmingham, et développe une nouvelle gamme autour de la sportive V4 et de la Commando.$h$, $h$[{"year":"1898","text":"James Lansdowne Norton fonde son entreprise à Birmingham."},{"year":"1902","text":"Premières motos Norton."},{"year":"1907","text":"Victoire de Rem Fowler au premier Tourist Trophy (bicylindre)."},{"year":"1925","text":"Mort de James Norton."},{"year":"1950","text":"Cadre Featherbed des frères McCandless."},{"year":"1951","text":"Geoff Duke champion du monde 350 et 500."},{"year":"1967","text":"Norton Commando."},{"year":"1973","text":"Fusion dans Norton-Villiers-Triumph."},{"year":"1992","text":"Steve Hislop gagne le Senior TT sur Norton à moteur rotatif."},{"year":"2020","text":"Rachat par TVS Motor."}]$h$::jsonb, $h$[{"name":"International","year":"Années 1930","text":"Le monocylindre de course qui a fait la réputation de Norton."},{"name":"Manx","year":"Années 1940-1960","text":"La moto de course des pilotes privés, sur cadre Featherbed."},{"name":"Commando 750","year":"1967","text":"Le bicylindre « Isolastic », élu moto de l’année."},{"name":"V4SV","year":"Années 2020","text":"La sportive V4 de la nouvelle Norton."}]$h$::jsonb, $h$["Le cadre Featherbed doit son surnom au confort qu’il procurait aux pilotes.","Les « Triton » associent un moteur Triumph et un cadre Norton : l’icône du café racer."]$h$::jsonb, $h$Groupe TVS Motor (Inde), usine à Solihull (Angleterre). Gamme V4 et Commando.$h$, 18)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$bsa$h$, $h$BSA$h$, $h$GB$h$, 1861, $h$Birmingham, Angleterre$h$, $h$Un groupement d’armuriers de Birmingham$h$, $h$Birmingham Small Arms : la Gold Star et la Bantam$h$, $h$BSA, c'est Birmingham Small Arms, « petites armes de Birmingham ». En 1861, des armuriers de la ville s'associent pour fabriquer des fusils à l'échelle industrielle. Comme d'autres fabricants d'armes, l'entreprise se diversifie à la fin du XIXe siècle dans la bicyclette, une activité qui demande la même précision mécanique.

## Les premières motos

Après des essais au début du siècle, BSA lance sa propre gamme de motos vers 1910. Les machines sont solides, fiables, bien finies : elles se vendent très bien, en Grande-Bretagne et dans tout l'Empire britannique. Pendant les deux guerres mondiales, BSA fournit en masse armes et motos à l'armée britannique. La M20, une monocylindre militaire, est produite en très grand nombre pendant la Seconde Guerre mondiale.

## La Gold Star

Le nom de la moto la plus célèbre de BSA vient d'une épingle. Sur le circuit de Brooklands, les pilotes qui bouclaient un tour à plus de 100 miles à l'heure de moyenne recevaient une petite étoile dorée. En 1937, Wal Handley obtient la sienne sur une BSA. La marque baptise alors sa sportive « Gold Star ». Après la guerre, la Gold Star devient la monocylindre de référence des courses de club et des cafés racers, en version Clubman notamment.

## La Bantam et l'âge d'or

En 1948, BSA lance la Bantam, une petite 125 deux-temps dérivée d'une moto allemande DKW dont les plans avaient été obtenus après la guerre. Simple et économique, elle connaît un énorme succès et sert de moto de travail, de livraison et d'apprentissage à des générations de Britanniques.

Dans les années 1950, BSA est l'un des plus grands constructeurs de motos au monde. Le groupe possède aussi Triumph depuis 1951 et Ariel. Les bicylindres A7 et A10, puis l'A65, se vendent bien, notamment aux États-Unis. En 1968, la Rocket 3, une trois-cylindres de 750 cm³ développée avec Triumph, sœur de la Trident, est une moto rapide et réussie.

## L'effondrement

Mais l'industrie britannique tarde à se moderniser et les motos japonaises arrivent. À la fin des années 1960 et au début des années 1970, BSA accumule les pertes. En 1973, ce qui reste de la marque est fusionné avec Norton et Triumph dans Norton-Villiers-Triumph, et BSA disparaît comme grand constructeur.

## Aujourd'hui

Le nom BSA a été racheté en 2016 par Classic Legends, société du groupe indien Mahindra. Une nouvelle Gold Star à moteur monocylindre de 650 cm³ a été présentée en 2021 et est produite pour le marché européen.$h$, $h$[{"year":"1861","text":"Des armuriers de Birmingham fondent BSA."},{"year":"Fin du XIXe siècle","text":"Diversification dans la bicyclette."},{"year":"Vers 1910","text":"Lancement de la gamme de motos BSA."},{"year":"1937","text":"Wal Handley gagne sa « Gold Star » à Brooklands sur BSA."},{"year":"Années 1940","text":"La M20 équipe l’armée britannique."},{"year":"1948","text":"BSA Bantam."},{"year":"1951","text":"Rachat de Triumph."},{"year":"1968","text":"Rocket 3, trois-cylindres de 750 cm³."},{"year":"1973","text":"Fusion dans Norton-Villiers-Triumph."},{"year":"2016","text":"Le nom est racheté par Classic Legends (groupe Mahindra)."},{"year":"2021","text":"Nouvelle Gold Star 650."}]$h$::jsonb, $h$[{"name":"M20","year":"Années 1940","text":"La monocylindre militaire de la Seconde Guerre mondiale."},{"name":"Gold Star","year":"Années 1930-1960","text":"La reine des courses de club et des cafés racers."},{"name":"Bantam","year":"1948","text":"La petite deux-temps qui a motorisé la Grande-Bretagne."},{"name":"Rocket 3","year":"1968","text":"La trois-cylindres sœur de la Triumph Trident."}]$h$::jsonb, $h$["Le nom Gold Star vient de l’étoile dorée remise aux pilotes qui tournaient à plus de 100 mph à Brooklands.","BSA a d’abord été une fabrique de fusils."]$h$::jsonb, $h$Marque du groupe Mahindra (Classic Legends). Nouvelle Gold Star 650 depuis 2021.$h$, 19)
on conflict (slug) do nothing;

insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values ($h$bimota$h$, $h$Bimota$h$, $h$IT$h$, 1973, $h$Rimini, Italie$h$, $h$Valerio Bianchi, Giuseppe Morri et Massimo Tamburini$h$, $h$Bi-Mo-Ta : des châssis d’orfèvre autour de moteurs japonais$h$, $h$Bimota, c'est un nom fabriqué avec trois autres : BIanchi, MOrri, TAmburini. Valerio Bianchi, Giuseppe Morri et Massimo Tamburini travaillent d'abord ensemble à Rimini dans le chauffage et la climatisation. Mais Tamburini est un passionné de moto, et il commence à construire des cadres pour améliorer les motos de l'époque.

## Les meilleurs moteurs, de meilleurs châssis

Au début des années 1970, les motos japonaises ont des moteurs puissants et fiables, mais leurs châssis ne suivent pas toujours. L'idée de Bimota est simple : prendre ces moteurs et les installer dans des cadres beaucoup plus rigides et légers, faits à la main. En 1973, la HB1, à moteur Honda, ouvre la voie, et l'activité moto devient officielle.

Le nom de chaque modèle dit d'où vient le moteur : SB pour Suzuki, KB pour Kawasaki, HB pour Honda, YB pour Yamaha, DB pour Ducati. La SB2 de 1977, à moteur Suzuki, avec sa carrosserie monobloc et son cadre en tubes, fait sensation.

## Un titre mondial

Bimota fournit aussi des châssis pour la course. En 1980, le Sud-Africain Jon Ekerold devient champion du monde 350 sur une moto à châssis Bimota et moteur Yamaha. La petite marque de Rimini prouve que son savoir-faire vaut celui des grands.

## La Tesi et l'audace

Bimota aime les idées folles. En 1990, la Tesi 1D remplace la fourche télescopique classique par une direction dans le moyeu de la roue avant, avec un bras oscillant à l'avant comme à l'arrière. Une solution radicale, encore aujourd'hui fascinante.

Massimo Tamburini quitte Bimota au milieu des années 1980. Il deviendra l'un des designers de motos les plus célèbres de tous les temps, avec la Ducati 916 et la MV Agusta F4.

## Hauts et bas

En 1997, Bimota tente de fabriquer son propre moteur avec la V Due, une 500 deux-temps à injection. Les problèmes de mise au point sont nombreux et la marque fait faillite peu après. En 2000, pourtant, l'Australien Anthony Gobert offre à Bimota une victoire en championnat du monde Superbike, sous la pluie de Phillip Island.

## Aujourd'hui

Après plusieurs relances, Bimota a trouvé un partenaire solide : en 2019, Kawasaki prend une participation importante dans la marque. La Tesi H2, à moteur Kawasaki suralimenté, marque ce renouveau, suivie de modèles comme la KB4. Bimota reste une marque rare, construite à Rimini en petites séries.$h$, $h$[{"year":"1973","text":"Création de l’activité moto à Rimini ; HB1 à moteur Honda."},{"year":"1977","text":"SB2 à moteur Suzuki."},{"year":"1980","text":"Jon Ekerold champion du monde 350 avec un châssis Bimota."},{"year":"Milieu des années 1980","text":"Massimo Tamburini quitte Bimota."},{"year":"1990","text":"Tesi 1D à direction dans le moyeu."},{"year":"1997","text":"V Due, 500 deux-temps à injection."},{"year":"2000","text":"Victoire en Superbike d’Anthony Gobert à Phillip Island."},{"year":"2019","text":"Kawasaki prend une participation dans Bimota."}]$h$::jsonb, $h$[{"name":"HB1","year":"1973","text":"La première Bimota, à moteur Honda."},{"name":"SB2","year":"1977","text":"La Suzuki habillée et châssée par Bimota."},{"name":"Tesi 1D","year":"1990","text":"La direction dans le moyeu, une audace unique."},{"name":"Tesi H2","year":"2020","text":"Le renouveau avec le moteur suralimenté de Kawasaki."}]$h$::jsonb, $h$["Bimota = BIanchi + MOrri + TAmburini.","Massimo Tamburini, cofondateur, a ensuite dessiné la Ducati 916 et la MV Agusta F4."]$h$::jsonb, $h$Marque de Rimini liée à Kawasaki depuis 2019. Petites séries : Tesi H2, KB4.$h$, 20)
on conflict (slug) do nothing;

insert into public.history_images (chapter_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$debuts-du-deux-roues-1.webp$h$, $h$Draisienne (Laufmaschine) des années 1820, Kurpfälzisches Museum, Heidelberg$h$, $h$Daderot$h$, $h$Domaine public$h$, null, $h$https://commons.wikimedia.org/wiki/File:Draisine_or_Laufmaschine,_c._1820_-_Kurpf%C3%A4lzisches_Museum_der_Stadt_Heidelberg_-_Heidelberg,_Germany_-_DSC01526.jpg$h$, 0
from public.history_chapters t where t.slug = $h$debuts-du-deux-roues$h$
  and not exists (select 1 from public.history_images x where x.path = $h$debuts-du-deux-roues-1.webp$h$);

insert into public.history_images (chapter_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$debuts-du-deux-roues-2.webp$h$, $h$Le vélocipède à vapeur Michaux-Perreaux$h$, $h$ROGERIOMACHADO from Brazil$h$, $h$CC BY-SA 2.0$h$, $h$https://creativecommons.org/licenses/by-sa/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:Michaux-Perreaux_steam_velocip%C3%A8de.jpg$h$, 1
from public.history_chapters t where t.slug = $h$debuts-du-deux-roues$h$
  and not exists (select 1 from public.history_images x where x.path = $h$debuts-du-deux-roues-2.webp$h$);

insert into public.history_images (chapter_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$debuts-du-deux-roues-3.webp$h$, $h$Réplique du Reitwagen de Daimler et Maybach (1885), Motor-Sport-Museum de Hockenheim$h$, $h$Alf van Beem$h$, $h$CC0$h$, $h$https://creativecommons.org/publicdomain/zero/1.0/deed.en$h$, $h$https://commons.wikimedia.org/wiki/File:Motor-Sport-Museum_am_Hockenheimring,_1885_Daimler_Reitwagen_replica.JPG$h$, 2
from public.history_chapters t where t.slug = $h$debuts-du-deux-roues$h$
  and not exists (select 1 from public.history_images x where x.path = $h$debuts-du-deux-roues-3.webp$h$);

insert into public.history_images (chapter_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$debuts-du-deux-roues-4.webp$h$, $h$Hildebrand & Wolfmüller de 1894, Musée national des techniques, Prague$h$, $h$Addvisor$h$, $h$CC BY-SA 4.0$h$, $h$https://creativecommons.org/licenses/by-sa/4.0$h$, $h$https://commons.wikimedia.org/wiki/File:Hildebrand_Wolfm%C3%BCller_1894_in_NTM_Prague.jpg$h$, 3
from public.history_chapters t where t.slug = $h$debuts-du-deux-roues$h$
  and not exists (select 1 from public.history_images x where x.path = $h$debuts-du-deux-roues-4.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$yamaha-1.webp$h$, $h$Yamaha YA-1 (1955), la toute première Yamaha, Yamaha Communication Plaza$h$, $h$PekePON$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:YAMAHA_YA-1_Yamaha_Communication_Plaza.jpg$h$, 0
from public.history_brands t where t.slug = $h$yamaha$h$
  and not exists (select 1 from public.history_images x where x.path = $h$yamaha-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$yamaha-2.webp$h$, $h$Yamaha XT500 de 1976$h$, $h$Rainmaker47$h$, $h$CC BY-SA 4.0$h$, $h$https://creativecommons.org/licenses/by-sa/4.0$h$, $h$https://commons.wikimedia.org/wiki/File:1976_Yamaha_XT500.JPG$h$, 1
from public.history_brands t where t.slug = $h$yamaha$h$
  and not exists (select 1 from public.history_images x where x.path = $h$yamaha-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$honda-1.webp$h$, $h$Honda Super Cub de première génération (1958)$h$, $h$Mj-bird$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:Honda_super_cub,_1st_Gen._1958,_Left_side.jpg$h$, 0
from public.history_brands t where t.slug = $h$honda$h$
  and not exists (select 1 from public.history_images x where x.path = $h$honda-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$honda-2.webp$h$, $h$Honda CB750 Four$h$, $h$Ronald Saunders from Warrington, UK$h$, $h$CC BY-SA 2.0$h$, $h$https://creativecommons.org/licenses/by-sa/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:Flickr_-_ronsaunders47_-_HONDA_CB750._1969-2003._750cc_FOUR_CYLINDER..jpg$h$, 1
from public.history_brands t where t.slug = $h$honda$h$
  and not exists (select 1 from public.history_images x where x.path = $h$honda-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$kawasaki-1.webp$h$, $h$Kawasaki 900 Z1$h$, $h$PekePON$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:Kawasaki_900_Z1.JPG$h$, 0
from public.history_brands t where t.slug = $h$kawasaki$h$
  and not exists (select 1 from public.history_images x where x.path = $h$kawasaki-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$kawasaki-2.webp$h$, $h$Kawasaki 500 H1 Mach III de 1969$h$, $h$Mike Schinkel$h$, $h$CC BY 2.0$h$, $h$https://creativecommons.org/licenses/by/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:1969_Kawasaki_500_H1_MachIII.jpg$h$, 1
from public.history_brands t where t.slug = $h$kawasaki$h$
  and not exists (select 1 from public.history_images x where x.path = $h$kawasaki-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$suzuki-1.webp$h$, $h$Suzuki GT750 de 1971, Suzuki Plaza$h$, $h$Rainmaker47$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:1971_Suzuki_GT750_at_Suzuki_Plaza.jpg$h$, 0
from public.history_brands t where t.slug = $h$suzuki$h$
  and not exists (select 1 from public.history_images x where x.path = $h$suzuki-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$suzuki-2.webp$h$, $h$Suzuki Colleda CO, l’une des premières motos Suzuki$h$, $h$Rainmaker47$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:Suzuki_Colleda_CO.JPG$h$, 1
from public.history_brands t where t.slug = $h$suzuki$h$
  and not exists (select 1 from public.history_images x where x.path = $h$suzuki-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$bmw-1.webp$h$, $h$BMW R 32 (1923), musée BMW, Munich$h$, $h$Arnaud 25$h$, $h$CC BY-SA 4.0$h$, $h$https://creativecommons.org/licenses/by-sa/4.0$h$, $h$https://commons.wikimedia.org/wiki/File:Mus%C3%A9e_BMW_015_-_BMW_R_32.jpg$h$, 0
from public.history_brands t where t.slug = $h$bmw$h$
  and not exists (select 1 from public.history_images x where x.path = $h$bmw-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$triumph-1.webp$h$, $h$Triumph Bonneville T120 de 1967$h$, $h$SG2012$h$, $h$CC BY 2.0$h$, $h$https://creativecommons.org/licenses/by/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:Triumph_Bonneville_T120_(1967).jpg$h$, 0
from public.history_brands t where t.slug = $h$triumph$h$
  and not exists (select 1 from public.history_images x where x.path = $h$triumph-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$ducati-1.webp$h$, $h$Ducati 750 Super Sport Desmo de 1975$h$, $h$Calreyn88$h$, $h$CC BY-SA 4.0$h$, $h$https://creativecommons.org/licenses/by-sa/4.0$h$, $h$https://commons.wikimedia.org/wiki/File:1975_Ducati_750_Super_Sport_Desmo.jpg$h$, 0
from public.history_brands t where t.slug = $h$ducati$h$
  and not exists (select 1 from public.history_images x where x.path = $h$ducati-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$ducati-2.webp$h$, $h$Ducati Monster M900 de 1994$h$, $h$Allen Bearce from Midwest City, USA$h$, $h$CC BY-SA 2.0$h$, $h$https://creativecommons.org/licenses/by-sa/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:Red_1994_Ducati_Monster_M900_left.jpg$h$, 1
from public.history_brands t where t.slug = $h$ducati$h$
  and not exists (select 1 from public.history_images x where x.path = $h$ducati-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$harley-davidson-1.webp$h$, $h$Harley-Davidson monocylindre des débuts$h$, $h$Cjp24$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:Harley-Davidson_Monocylinder.jpg$h$, 0
from public.history_brands t where t.slug = $h$harley-davidson$h$
  and not exists (select 1 from public.history_images x where x.path = $h$harley-davidson-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$harley-davidson-2.webp$h$, $h$Harley-Davidson WLA militaire, Australian War Memorial$h$, $h$User:Bukvoed$h$, $h$CC BY 2.5$h$, $h$https://creativecommons.org/licenses/by/2.5$h$, $h$https://commons.wikimedia.org/wiki/File:AWM-Harley-Davidson-42WLA-1.jpg$h$, 1
from public.history_brands t where t.slug = $h$harley-davidson$h$
  and not exists (select 1 from public.history_images x where x.path = $h$harley-davidson-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$ktm-1.webp$h$, $h$La KTM de David Schwarz au rallye Barcelone-Dakar 2005$h$, $h$GTHO$h$, $h$Domaine public$h$, null, $h$https://commons.wikimedia.org/wiki/File:David_Schwarz_-_KTM_-_2005_Barcelona_to_Dakar_Rally.jpg$h$, 0
from public.history_brands t where t.slug = $h$ktm$h$
  and not exists (select 1 from public.history_images x where x.path = $h$ktm-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$ktm-2.webp$h$, $h$KTM 950 Adventure de 2004$h$, $h$Cowgirlonline$h$, $h$CC BY 2.0$h$, $h$https://creativecommons.org/licenses/by/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:KTM_950_ADVENTURE_2004.jpg$h$, 1
from public.history_brands t where t.slug = $h$ktm$h$
  and not exists (select 1 from public.history_images x where x.path = $h$ktm-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$royal-enfield-1.webp$h$, $h$Royal Enfield Bullet 350 de 1955$h$, $h$Thruxton$h$, $h$CC BY 3.0$h$, $h$https://creativecommons.org/licenses/by/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:Royal_Enfield_Bullet_350_1955.JPG$h$, 0
from public.history_brands t where t.slug = $h$royal-enfield$h$
  and not exists (select 1 from public.history_images x where x.path = $h$royal-enfield-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$peugeot-1.webp$h$, $h$Giosuè Giuppone sur Peugeot au Tour de France motocycliste de 1905$h$, $h$Jean Beau$h$, $h$Domaine public$h$, null, $h$https://commons.wikimedia.org/wiki/File:Giosu%C3%A8_Giuppone_au_Tour_de_France_motocycliste_1905_sur_Peugeot.jpg$h$, 0
from public.history_brands t where t.slug = $h$peugeot$h$
  and not exists (select 1 from public.history_images x where x.path = $h$peugeot-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$moto-guzzi-1.webp$h$, $h$Moto Guzzi 850 Le Mans$h$, $h$AlfvanBeem$h$, $h$CC0$h$, $h$https://creativecommons.org/publicdomain/zero/1.0/deed.en$h$, $h$https://commons.wikimedia.org/wiki/File:Red_Moto_Guzzi_850_Le_Mans_pic1.JPG$h$, 0
from public.history_brands t where t.slug = $h$moto-guzzi$h$
  and not exists (select 1 from public.history_images x where x.path = $h$moto-guzzi-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$indian-1.webp$h$, $h$Indian Scout, Zweirad-Museum NSU, Neckarsulm$h$, $h$Joachim Köhler$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0/$h$, $h$https://commons.wikimedia.org/wiki/File:ZweiRadMuseumNSU_Indian_Scout.JPG$h$, 0
from public.history_brands t where t.slug = $h$indian$h$
  and not exists (select 1 from public.history_images x where x.path = $h$indian-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$indian-2.webp$h$, $h$Indian Chief de 1948$h$, $h$Rikita$h$, $h$CC BY-SA 4.0$h$, $h$https://creativecommons.org/licenses/by-sa/4.0$h$, $h$https://commons.wikimedia.org/wiki/File:Indian_chief_1948.jpg$h$, 1
from public.history_brands t where t.slug = $h$indian$h$
  and not exists (select 1 from public.history_images x where x.path = $h$indian-2.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$aprilia-1.webp$h$, $h$Aprilia RSV 1000 R$h$, $h$Brian Snelson$h$, $h$CC BY 2.0$h$, $h$https://creativecommons.org/licenses/by/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:Aprilia_RSV_1000R_red.jpg$h$, 0
from public.history_brands t where t.slug = $h$aprilia$h$
  and not exists (select 1 from public.history_images x where x.path = $h$aprilia-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$mv-agusta-1.webp$h$, $h$MV Agusta 750 S, musée Boxenstop de Tübingen$h$, $h$Didym$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:Boxenstop_T%C3%BCbingen_-_MV_Agusta_750_S.jpg$h$, 0
from public.history_brands t where t.slug = $h$mv-agusta$h$
  and not exists (select 1 from public.history_images x where x.path = $h$mv-agusta-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$husqvarna-1.webp$h$, $h$Husqvarna 500 cm³ de course de 1935$h$, $h$User Piero on nl.wikipedia$h$, $h$Domaine public$h$, null, $h$https://commons.wikimedia.org/wiki/File:Husqvarna_500_cc_racer_1935.jpg$h$, 0
from public.history_brands t where t.slug = $h$husqvarna$h$
  and not exists (select 1 from public.history_images x where x.path = $h$husqvarna-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$benelli-1.webp$h$, $h$Benelli 750 Sei$h$, $h$Lothar Spurzem$h$, $h$CC BY-SA 2.0 de$h$, $h$https://creativecommons.org/licenses/by-sa/2.0/de/deed.en$h$, $h$https://commons.wikimedia.org/wiki/File:Benelli_750_Sei_(2016-09-04).JPG$h$, 0
from public.history_brands t where t.slug = $h$benelli$h$
  and not exists (select 1 from public.history_images x where x.path = $h$benelli-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$norton-1.webp$h$, $h$Norton 750 Commando$h$, $h$Alf van Beem$h$, $h$CC0$h$, $h$https://creativecommons.org/publicdomain/zero/1.0/deed.en$h$, $h$https://commons.wikimedia.org/wiki/File:Norton_750_Commando_pic1.JPG$h$, 0
from public.history_brands t where t.slug = $h$norton$h$
  and not exists (select 1 from public.history_images x where x.path = $h$norton-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$bsa-1.webp$h$, $h$BSA Gold Star 500 Clubmans$h$, $h$Tony Hisgett from Birmingham, UK$h$, $h$CC BY 2.0$h$, $h$https://creativecommons.org/licenses/by/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:BSA_Gold_Star_500_Clubmans_(6390828201).jpg$h$, 0
from public.history_brands t where t.slug = $h$bsa$h$
  and not exists (select 1 from public.history_images x where x.path = $h$bsa-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$bimota-1.webp$h$, $h$Bimota SB2 de 1979$h$, $h$Mr.choppers$h$, $h$CC BY-SA 3.0$h$, $h$https://creativecommons.org/licenses/by-sa/3.0$h$, $h$https://commons.wikimedia.org/wiki/File:1979_Bimota_SB2_A._Berkel.jpg$h$, 0
from public.history_brands t where t.slug = $h$bimota$h$
  and not exists (select 1 from public.history_images x where x.path = $h$bimota-1.webp$h$);

insert into public.history_images (brand_id, path, caption, author, license, license_url, source_url, sort_order)
select t.id, $h$bimota-2.webp$h$, $h$Bimota Tesi 1D$h$, $h$Craig Howell from San Carlos, CA, USA$h$, $h$CC BY 2.0$h$, $h$https://creativecommons.org/licenses/by/2.0$h$, $h$https://commons.wikimedia.org/wiki/File:Bimota_Tesi_1D.jpg$h$, 1
from public.history_brands t where t.slug = $h$bimota$h$
  and not exists (select 1 from public.history_images x where x.path = $h$bimota-2.webp$h$);

