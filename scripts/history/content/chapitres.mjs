// Chapitres de « Histoire de la moto » (note 22). Source du contenu initial : inséré une seule fois en base
// par la migration générée (scripts/history/build-seed.mjs), ensuite modifiable dans Console › Histoire.
// Règle : uniquement des faits sûrs. Les points douteux sont listés dans scripts/history/incertains.md.

export default [
  {
    slug: 'debuts-du-deux-roues',
    title: 'Les débuts du deux-roues',
    subtitle: 'De la draisienne en bois à la première moto vendue en série',
    sort_order: 1,
    images: [
      { file: 'Draisine or Laufmaschine, c. 1820 - Kurpfälzisches Museum der Stadt Heidelberg - Heidelberg, Germany - DSC01526.jpg', caption: 'Draisienne (Laufmaschine) des années 1820, Kurpfälzisches Museum, Heidelberg' },
      { file: 'Michaux-Perreaux steam velocipède.jpg', caption: 'Le vélocipède à vapeur Michaux-Perreaux' },
      { file: 'Motor-Sport-Museum am Hockenheimring, 1885 Daimler Reitwagen replica.JPG', caption: 'Réplique du Reitwagen de Daimler et Maybach (1885), Motor-Sport-Museum de Hockenheim' },
      { file: 'Hildebrand Wolfmüller 1894 in NTM Prague.jpg', caption: 'Hildebrand & Wolfmüller de 1894, Musée national des techniques, Prague' },
    ],
    body: `Avant le moteur, il a fallu inventer l'idée même de tenir en équilibre sur deux roues alignées. Ça paraît évident aujourd'hui ; au début du XIXe siècle, c'était une petite révolution.

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

En moins d'un siècle, on est passé d'une machine en bois poussée avec les pieds à des motos capables de tenir la route pendant des heures. La suite, ce sont les marques qui l'écrivent : à découvrir dans leurs fiches.`,
    timeline: [
      ['1817', 'Karl Drais présente sa « Laufmaschine » à Mannheim : la draisienne.'],
      ['1818', 'Drais obtient un brevet en France.'],
      ['Années 1860', 'L’atelier de Pierre Michaux, à Paris, popularise le vélocipède à pédales.'],
      ['Fin des années 1860', 'Vélocipède à vapeur Michaux-Perreaux.'],
      ['1885', 'Daimler et Maybach construisent le Reitwagen, premier deux-roues à moteur à essence.'],
      ['1894', 'Hildebrand & Wolfmüller : première moto produite en série.'],
      ['1897', 'Les frères Werner lancent la « Motocyclette ».'],
      ['1901', 'La nouvelle Werner place le moteur en bas du cadre : l’architecture moderne.'],
      ['1907', 'Premier Tourist Trophy de l’île de Man.'],
    ],
  },
];
