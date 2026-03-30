/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Static CMS page content for all storefront informational pages.
 * Content is defined here per locale to avoid polluting the main i18n JSON files
 * with large multi-paragraph text blocks.
 * Supported locales: en-US, fr-FR, es-ES, ar-SA, zh-CN, he-IL
 */

export type CmsSection = {
  heading: string;
  body: string;
};

export type CmsPageContent = {
  title: string;
  lead: string;
  sections: CmsSection[];
};

/** Map: handle → locale → content */
export const CMS_CONTENT: Record<string, Record<string, CmsPageContent>> = {
  // ─────────────────────────── ABOUT ──────────────────────────────────────
  about: {
    "en-US": {
      title: "About Fufuni",
      lead: "Fufuni is an open-source e-commerce platform built on Cloudflare's global edge network, designed to help merchants launch fast, scalable online stores without infrastructure headaches.",
      sections: [
        {
          heading: "Our Story",
          body: "Fufuni was born from a simple frustration: existing e-commerce solutions were either too expensive, too complex, or too slow. We set out to build something different — a platform that leverages Cloudflare Workers and Durable Objects to deliver sub-millisecond response times at the edge, anywhere in the world.",
        },
        {
          heading: "Our Mission",
          body: "Our mission is to democratize e-commerce by providing enterprise-grade infrastructure to every merchant, regardless of size. From a solo artisan to a rapidly growing brand, Fufuni scales with you — with no server management, no uptime worries, and no surprise bills.",
        },
        {
          heading: "Our Values",
          body: "We believe in open source, transparency, and developer empowerment. Every line of Fufuni's code is available on GitHub, and we actively welcome contributions. Privacy and security are core to our design — not afterthoughts.",
        },
      ],
    },
    "fr-FR": {
      title: "À propos de Fufuni",
      lead: "Fufuni est une plateforme e-commerce open source construite sur le réseau mondial de Cloudflare, conçue pour aider les marchands à lancer des boutiques en ligne rapides et évolutives sans se soucier de l'infrastructure.",
      sections: [
        {
          heading: "Notre histoire",
          body: "Fufuni est né d'une frustration simple : les solutions e-commerce existantes étaient soit trop coûteuses, soit trop complexes, soit trop lentes. Nous avons décidé de construire quelque chose de différent, une plateforme qui exploite la puissance des Cloudflare Workers et des Durable Objects.",
        },
        {
          heading: "Notre mission",
          body: "Notre mission est de démocratiser le commerce en ligne en fournissant une infrastructure de niveau entreprise à chaque marchand, quelle que soit sa taille. De l'artisan indépendant à la marque en pleine croissance, Fufuni évolue avec vous sans gestion de serveurs ni mauvaises surprises.",
        },
        {
          heading: "Nos valeurs",
          body: "Nous croyons en l'open source, la transparence et l'autonomisation des développeurs. Chaque ligne de code de Fufuni est disponible sur GitHub. La confidentialité et la sécurité sont au cœur de notre conception, pas une réflexion après coup.",
        },
      ],
    },
    "es-ES": {
      title: "Acerca de Fufuni",
      lead: "Fufuni es una plataforma de comercio electrónico de código abierto construida sobre la red global de Cloudflare, diseñada para ayudar a los comerciantes a lanzar tiendas en línea rápidas y escalables.",
      sections: [
        {
          heading: "Nuestra historia",
          body: "Fufuni nació de una frustración simple: las soluciones de e-commerce existentes eran demasiado costosas, complejas o lentas. Decidimos construir algo diferente aprovechando el poder de Cloudflare Workers y Durable Objects para ofrecer tiempos de respuesta ultrarrápidos.",
        },
        {
          heading: "Nuestra misión",
          body: "Nuestra misión es democratizar el comercio electrónico proporcionando infraestructura de nivel empresarial a cada comerciante, independientemente de su tamaño. Fufuni escala contigo sin gestión de servidores ni sorpresas en la factura.",
        },
        {
          heading: "Nuestros valores",
          body: "Creemos en el código abierto, la transparencia y el empoderamiento de los desarrolladores. Todo el código de Fufuni está disponible en GitHub. La privacidad y la seguridad son fundamentales en nuestro diseño.",
        },
      ],
    },
    "ar-SA": {
      title: "عن فوفوني",
      lead: "فوفوني هي منصة تجارة إلكترونية مفتوحة المصدر مبنية على شبكة كلاودفلير العالمية، مصممة لمساعدة التجار على إطلاق متاجر إلكترونية سريعة وقابلة للتوسع دون القلق بشأن البنية التحتية.",
      sections: [
        {
          heading: "قصتنا",
          body: "وُلدت فوفوني من إحباط بسيط: حلول التجارة الإلكترونية الموجودة كانت إما باهظة التكلفة أو معقدة للغاية أو بطيئة جداً. قررنا بناء شيء مختلف يستفيد من قوة Cloudflare Workers وDurable Objects لتقديم أوقات استجابة أقل من المللي ثانية.",
        },
        {
          heading: "مهمتنا",
          body: "مهمتنا هي إضفاء الطابع الديمقراطي على التجارة الإلكترونية من خلال توفير بنية تحتية بمستوى المؤسسات لكل تاجر بغض النظر عن حجمه. فوفوني تنمو معك دون قلق بشأن إدارة الخوادم.",
        },
        {
          heading: "قيمنا",
          body: "نؤمن بالمصدر المفتوح والشفافية وتمكين المطورين. كل سطر من كود فوفوني متاح على GitHub. الخصوصية والأمان هما جوهر تصميمنا وليسا فكرة لاحقة.",
        },
      ],
    },
    "zh-CN": {
      title: "关于 Fufuni",
      lead: "Fufuni 是一个基于 Cloudflare 全球边缘网络的开源电商平台，旨在帮助商家无需担心基础设施即可快速搭建高性能、可扩展的在线商店。",
      sections: [
        {
          heading: "我们的故事",
          body: "Fufuni 诞生于对现有电商解决方案的不满——它们要么太贵、要么太复杂、要么太慢。我们决定利用 Cloudflare Workers 和 Durable Objects 构建一个全新的解决方案，在全球任何地方实现毫秒级响应时间。",
        },
        {
          heading: "我们的使命",
          body: "我们的使命是让每一位商家都能享受企业级基础设施，无论规模大小。Fufuni 与您共同成长，无需管理服务器，无需担心停机时间，无隐藏费用。",
        },
        {
          heading: "我们的价值观",
          body: "我们相信开源、透明和开发者赋能。Fufuni 的每一行代码都在 GitHub 上公开。隐私和安全是我们设计的核心，而非事后的补充。",
        },
      ],
    },
    "he-IL": {
      title: "אודות Fufuni",
      lead: "Fufuni היא פלטפורמת מסחר אלקטרוני קוד פתוח הבנויה על רשת Cloudflare הגלובלית, המיועדת לסייע לסוחרים להשיק חנויות מקוונות מהירות וניתנות להתרחבות ללא כאב ראש תשתיתי.",
      sections: [
        {
          heading: "הסיפור שלנו",
          body: "Fufuni נולדה מתסכול פשוט: פתרונות המסחר האלקטרוני הקיימים היו יקרים, מורכבים או איטיים מדי. החלטנו לבנות משהו שונה תוך ניצול עוצמת Cloudflare Workers ו-Durable Objects למתן זמני תגובה מהירים מהאור.",
        },
        {
          heading: "המשימה שלנו",
          body: "המשימה שלנו היא לדמוקרטיזציה של המסחר האלקטרוני על ידי מתן תשתית ברמת ארגונים לכל סוחר, ללא קשר לגודלו. Fufuni גדלה איתך ללא ניהול שרתים וללא הפתעות בחשבון.",
        },
        {
          heading: "הערכים שלנו",
          body: "אנו מאמינים בקוד פתוח, שקיפות והעצמת מפתחים. כל שורת קוד של Fufuni זמינה ב-GitHub. פרטיות ואבטחה הן ליבת העיצוב שלנו ולא מחשבה שנייה.",
        },
      ],
    },
  },

  // ─────────────────────────── BLOG ───────────────────────────────────────
  blog: {
    "en-US": {
      title: "Fufuni Blog",
      lead: "Discover insights on e-commerce, platform updates, merchant success stories, and technical deep-dives from the Fufuni team.",
      sections: [
        {
          heading: "Coming Soon",
          body: "Our blog is under construction. We are preparing in-depth articles on building performant e-commerce storefronts, leveraging Cloudflare's edge for global reach, and practical tips for growing your online business.",
        },
        {
          heading: "What to Expect",
          body: "From tutorials on Cloudflare Workers and Durable Objects, to case studies of merchants who scaled their business with Fufuni — our blog will cover topics that matter to developers and shop owners alike.",
        },
        {
          heading: "Stay in the Loop",
          body: "Subscribe to our newsletter at the bottom of this page to be the first notified when new articles go live. We publish new content every two weeks.",
        },
      ],
    },
    "fr-FR": {
      title: "Blog Fufuni",
      lead: "Découvrez des articles sur le e-commerce, les mises à jour de la plateforme, les success stories de marchands et les analyses techniques de l'équipe Fufuni.",
      sections: [
        {
          heading: "Bientôt disponible",
          body: "Notre blog est en cours de construction. Nous préparons des articles approfondis sur la création de storefronts e-commerce performants, l'exploitation du réseau edge de Cloudflare et des conseils pratiques pour développer votre activité en ligne.",
        },
        {
          heading: "Ce qui vous attend",
          body: "Des tutoriels sur Cloudflare Workers et Durable Objects aux études de cas de marchands ayant développé leur activité avec Fufuni — notre blog abordera des sujets qui comptent pour les développeurs comme pour les propriétaires de boutiques.",
        },
        {
          heading: "Restez informé",
          body: "Abonnez-vous à notre newsletter en bas de cette page pour être informé en premier lorsque de nouveaux articles sont publiés. Nous publions du contenu toutes les deux semaines.",
        },
      ],
    },
    "es-ES": {
      title: "Blog de Fufuni",
      lead: "Descubre artículos sobre e-commerce, actualizaciones de la plataforma, historias de éxito de comerciantes y análisis técnicos del equipo de Fufuni.",
      sections: [
        {
          heading: "Próximamente",
          body: "Nuestro blog está en construcción. Estamos preparando artículos detallados sobre cómo construir storefronts de e-commerce de alto rendimiento, aprovechar el edge de Cloudflare y consejos prácticos para hacer crecer tu negocio en línea.",
        },
        {
          heading: "Qué esperar",
          body: "Desde tutoriales sobre Cloudflare Workers hasta casos de estudio de comerciantes que escalaron su negocio con Fufuni — nuestro blog cubrirá temas que importan tanto a desarrolladores como a propietarios de tiendas.",
        },
        {
          heading: "Mantente informado",
          body: "Suscríbete a nuestro boletín al final de esta página para ser el primero en recibir notificaciones cuando se publiquen nuevos artículos. Publicamos contenido cada dos semanas.",
        },
      ],
    },
    "ar-SA": {
      title: "مدونة فوفوني",
      lead: "اكتشف مقالات حول التجارة الإلكترونية وتحديثات المنصة وقصص نجاح التجار والتحليلات التقنية من فريق فوفوني.",
      sections: [
        {
          heading: "قريباً",
          body: "مدونتنا قيد الإنشاء. نحن نعد مقالات متعمقة حول بناء واجهات تجارة إلكترونية عالية الأداء والاستفادة من شبكة Cloudflare Edge ونصائح عملية لتنمية أعمالك التجارية عبر الإنترنت.",
        },
        {
          heading: "ما يمكن توقعه",
          body: "من البرامج التعليمية حول Cloudflare Workers إلى دراسات حالة التجار الذين وسعوا أعمالهم مع فوفوني — ستغطي مدونتنا الموضوعات المهمة للمطورين وأصحاب المتاجر على حد سواء.",
        },
        {
          heading: "ابق على اطلاع",
          body: "اشترك في نشرتنا الإخبارية في أسفل هذه الصفحة لتكون أول من يتم إخطاره عند نشر مقالات جديدة. ننشر محتوى جديداً كل أسبوعين.",
        },
      ],
    },
    "zh-CN": {
      title: "Fufuni 博客",
      lead: "探索关于电商、平台更新、商家成功案例以及 Fufuni 团队技术深度分析的精彩文章。",
      sections: [
        {
          heading: "即将推出",
          body: "我们的博客正在建设中。我们正在准备关于构建高性能电商店面、利用 Cloudflare 边缘网络实现全球覆盖以及在线业务增长实用技巧的深度文章。",
        },
        {
          heading: "博客内容预览",
          body: "从 Cloudflare Workers 教程到使用 Fufuni 扩展业务的商家案例研究——我们的博客将涵盖对开发者和店主都有价值的主题。",
        },
        {
          heading: "保持关注",
          body: "在页面底部订阅我们的新闻通讯，当有新文章发布时第一时间收到通知。我们每两周发布一次新内容。",
        },
      ],
    },
    "he-IL": {
      title: "הבלוג של Fufuni",
      lead: "גלה תובנות על מסחר אלקטרוני, עדכוני פלטפורמה, סיפורי הצלחה של סוחרים וניתוחים טכניים מצוות Fufuni.",
      sections: [
        {
          heading: "בקרוב",
          body: "הבלוג שלנו בבנייה. אנחנו מכינים מאמרים מעמיקים על בניית חנויות מסחר אלקטרוני בעלות ביצועים גבוהים, ניצול רשת Cloudflare Edge והגדלת העסק המקוון שלך.",
        },
        {
          heading: "מה לצפות",
          body: "ממדריכים על Cloudflare Workers ועד מחקרי מקרה של סוחרים שהצליחו עם Fufuni — הבלוג שלנו יכסה נושאים שחשובים למפתחים ולבעלי חנויות כאחד.",
        },
        {
          heading: "הישארו מעודכנים",
          body: "הירשמו לניוזלטר שלנו בתחתית הדף כדי להיות הראשונים לדעת כשמתפרסמים מאמרים חדשים. אנחנו מפרסמים תוכן חדש כל שבועיים.",
        },
      ],
    },
  },

  // ─────────────────────────── CAREERS ────────────────────────────────────
  careers: {
    "en-US": {
      title: "Careers at Fufuni",
      lead: "Help us build the future of edge-native e-commerce. We're a small, focused team that values craftsmanship, autonomy, and impact.",
      sections: [
        {
          heading: "Our Culture",
          body: "We are remote-first, async-friendly, and deeply technical. We care about the quality of our code as much as the quality of the experience we deliver. Every team member has a real impact on the product, and ideas are welcomed from everyone regardless of seniority.",
        },
        {
          heading: "Open Positions",
          body: "We don't currently have any open positions, but we're always interested in meeting exceptional engineers, designers, and product thinkers. If you're passionate about edge computing, open source, or e-commerce, feel free to reach out at careers@fufuni.io.",
        },
        {
          heading: "What We Offer",
          body: "Competitive compensation, equity participation, full remote flexibility, a generous equipment budget, and the opportunity to work on open-source software used by merchants worldwide. We take work-life balance seriously.",
        },
      ],
    },
    "fr-FR": {
      title: "Carrières chez Fufuni",
      lead: "Aidez-nous à construire l'avenir du e-commerce natif en bordure de réseau. Nous sommes une équipe restreinte et concentrée qui valorise l'artisanat, l'autonomie et l'impact.",
      sections: [
        {
          heading: "Notre culture",
          body: "Nous sommes remote-first, async-friendly et profondément techniques. Nous accordons autant d'importance à la qualité de notre code qu'à la qualité de l'expérience que nous offrons. Chaque membre de l'équipe a un impact réel sur le produit.",
        },
        {
          heading: "Postes ouverts",
          body: "Nous n'avons actuellement aucun poste ouvert, mais nous sommes toujours intéressés par des ingénieurs, designers et product thinkers exceptionnels. Si vous êtes passionné par le edge computing, l'open source ou le e-commerce, contactez-nous à careers@fufuni.io.",
        },
        {
          heading: "Ce que nous offrons",
          body: "Rémunération compétitive, participation au capital, flexibilité full remote, budget équipement généreux et opportunité de travailler sur un logiciel open source utilisé par des marchands dans le monde entier.",
        },
      ],
    },
    "es-ES": {
      title: "Carreras en Fufuni",
      lead: "Ayúdanos a construir el futuro del e-commerce nativo en el edge. Somos un equipo pequeño y enfocado que valora el artesanado, la autonomía y el impacto.",
      sections: [
        {
          heading: "Nuestra cultura",
          body: "Somos remote-first, async-friendly y profundamente técnicos. Nos importa tanto la calidad de nuestro código como la calidad de la experiencia que ofrecemos. Cada miembro del equipo tiene un impacto real en el producto.",
        },
        {
          heading: "Posiciones abiertas",
          body: "Actualmente no tenemos posiciones abiertas, pero siempre estamos interesados en conocer ingenieros, diseñadores y pensadores de producto excepcionales. Si te apasiona la computación en el edge, el código abierto o el e-commerce, contáctanos en careers@fufuni.io.",
        },
        {
          heading: "Lo que ofrecemos",
          body: "Compensación competitiva, participación en equity, flexibilidad total remota, presupuesto generoso para equipo y la oportunidad de trabajar en software open source utilizado por comerciantes en todo el mundo.",
        },
      ],
    },
    "ar-SA": {
      title: "الوظائف في فوفوني",
      lead: "ساعدنا في بناء مستقبل التجارة الإلكترونية الأصلية على الحافة. نحن فريق صغير ومركز يقدر الحرفية والاستقلالية والتأثير.",
      sections: [
        {
          heading: "ثقافتنا",
          body: "نحن نعمل عن بُعد أولاً، وصديقون للعمل غير المتزامن، وعمیقو التقنية. نهتم بجودة الكود الخاص بنا بقدر اهتمامنا بجودة التجربة التي نقدمها. كل عضو في الفريق له تأثير حقيقي على المنتج.",
        },
        {
          heading: "المناصب المفتوحة",
          body: "ليس لدينا حالياً أي مناصب مفتوحة، لكننا دائماً مهتمون بمقابلة مهندسين ومصممين ومفكري منتجات استثنائيين. إذا كنت متحمساً للحوسبة على الحافة أو المصدر المفتوح أو التجارة الإلكترونية، تواصل معنا على careers@fufuni.io.",
        },
        {
          heading: "ما نقدمه",
          body: "تعويض تنافسي، مشاركة في الأسهم، مرونة كاملة في العمل عن بُعد، ميزانية سخية للمعدات، وفرصة العمل على برامج مفتوحة المصدر يستخدمها التجار في جميع أنحاء العالم.",
        },
      ],
    },
    "zh-CN": {
      title: "加入 Fufuni",
      lead: "帮助我们构建边缘原生电商的未来。我们是一个小而专注的团队，重视精工品质、自主性和影响力。",
      sections: [
        {
          heading: "我们的文化",
          body: "我们是远程优先、异步友好、深度技术导向的团队。我们对代码质量和用户体验同样重视。每位团队成员都对产品有真实的影响，不论资历，好的想法都受到欢迎。",
        },
        {
          heading: "开放职位",
          body: "目前我们没有开放的职位，但我们随时欢迎优秀的工程师、设计师和产品思考者联系我们。如果您对边缘计算、开源或电商充满热情，请发邮件至 careers@fufuni.io。",
        },
        {
          heading: "我们提供什么",
          body: "有竞争力的薪酬、股权参与、完全远程灵活性、充裕的设备预算，以及参与全球商家使用的开源软件开发的机会。我们认真对待工作与生活的平衡。",
        },
      ],
    },
    "he-IL": {
      title: "קריירה ב-Fufuni",
      lead: "עזרו לנו לבנות את עתיד המסחר האלקטרוני המקורי בקצה הרשת. אנחנו צוות קטן וממוקד שמעריך מלאכותיות, אוטונומיה והשפעה.",
      sections: [
        {
          heading: "התרבות שלנו",
          body: "אנחנו remote-first, ידידותיים לעבודה א-סינכרונית ועמוקים מבחינה טכנולוגית. אכפת לנו מאיכות הקוד שלנו לא פחות מאיכות החוויה שאנחנו מספקים. לכל חבר צוות יש השפעה אמיתית על המוצר.",
        },
        {
          heading: "משרות פתוחות",
          body: "כרגע אין לנו משרות פתוחות, אבל אנחנו תמיד מעוניינים לפגוש מהנדסים, מעצבים וחושבי מוצר יוצאי דופן. אם אתם נלהבים ממחשוב בקצה, קוד פתוח או מסחר אלקטרוני, פנו אלינו ב-careers@fufuni.io.",
        },
        {
          heading: "מה אנחנו מציעים",
          body: "תגמול תחרותי, השתתפות בהון, גמישות מלאה בעבודה מרחוק, תקציב ציוד נדיב, והזדמנות לעבוד על תוכנת קוד פתוח שבה משתמשים סוחרים ברחבי העולם.",
        },
      ],
    },
  },

  // ─────────────────────────── PRESS ──────────────────────────────────────
  press: {
    "en-US": {
      title: "Press & Media",
      lead: "Find the information you need to write about Fufuni — our story, brand assets, and press contacts all in one place.",
      sections: [
        {
          heading: "About Fufuni",
          body: "Fufuni is a next-generation open-source e-commerce platform based on Cloudflare Workers and Durable Objects. Founded in 2024, it enables merchants to deploy globally distributed stores with zero infrastructure management. The platform supports multi-language, multi-currency, and multi-region operations out of the box.",
        },
        {
          heading: "Press Kit",
          body: "Our press kit includes high-resolution logos, product screenshots, founder bios, and key company facts. Download the press kit at press@fufuni.io or visit our GitHub repository. All assets are freely available for editorial use with attribution.",
        },
        {
          heading: "Press Contact",
          body: "For press inquiries, interview requests, and partnership announcements, please contact our communications team at press@fufuni.io. We typically respond within one business day.",
        },
      ],
    },
    "fr-FR": {
      title: "Presse & Médias",
      lead: "Trouvez toutes les informations nécessaires pour écrire sur Fufuni — notre histoire, nos ressources de marque et nos contacts presse en un seul endroit.",
      sections: [
        {
          heading: "À propos de Fufuni",
          body: "Fufuni est une plateforme e-commerce open source de nouvelle génération basée sur Cloudflare Workers et Durable Objects. Fondée en 2024, elle permet aux marchands de déployer des boutiques distribuées globalement sans aucune gestion d'infrastructure. La plateforme prend en charge les opérations multilingues, multi-devises et multirégions nativement.",
        },
        {
          heading: "Kit presse",
          body: "Notre kit presse comprend des logos haute résolution, des captures d'écran du produit, des biographies des fondateurs et des faits clés sur l'entreprise. Téléchargez le kit presse depuis press@fufuni.io ou visitez notre dépôt GitHub.",
        },
        {
          heading: "Contact presse",
          body: "Pour les demandes presse, les interviews et les annonces de partenariats, veuillez contacter notre équipe de communication à press@fufuni.io. Nous répondons généralement dans un délai d'un jour ouvrable.",
        },
      ],
    },
    "es-ES": {
      title: "Prensa y Medios",
      lead: "Encuentra toda la información que necesitas para escribir sobre Fufuni — nuestra historia, recursos de marca y contactos de prensa en un solo lugar.",
      sections: [
        {
          heading: "Acerca de Fufuni",
          body: "Fufuni es una plataforma de e-commerce open source de nueva generación basada en Cloudflare Workers y Durable Objects. Fundada en 2024, permite a los comerciantes desplegar tiendas distribuidas globalmente sin ninguna gestión de infraestructura.",
        },
        {
          heading: "Kit de prensa",
          body: "Nuestro kit de prensa incluye logotipos en alta resolución, capturas de pantalla del producto, biografías de los fundadores y datos clave de la empresa. Descarga el kit de prensa desde press@fufuni.io o visita nuestro repositorio de GitHub.",
        },
        {
          heading: "Contacto de prensa",
          body: "Para consultas de prensa, solicitudes de entrevistas y anuncios de asociaciones, contacta a nuestro equipo de comunicaciones en press@fufuni.io. Normalmente respondemos en un día hábil.",
        },
      ],
    },
    "ar-SA": {
      title: "الصحافة والإعلام",
      lead: "اعثر على المعلومات التي تحتاجها للكتابة عن فوفوني — قصتنا وأصول العلامة التجارية وجهات الاتصال الصحفية كلها في مكان واحد.",
      sections: [
        {
          heading: "عن فوفوني",
          body: "فوفوني هي منصة تجارة إلكترونية مفتوحة المصدر من الجيل التالي مبنية على Cloudflare Workers وDurable Objects. تأسست عام 2024، تمكّن التجار من نشر متاجر موزعة عالمياً دون أي إدارة للبنية التحتية.",
        },
        {
          heading: "حقيبة الصحافة",
          body: "تتضمن حقيبتنا الصحفية شعارات عالية الدقة ولقطات شاشة للمنتج وسير ذاتية للمؤسسين وحقائق رئيسية عن الشركة. قم بتنزيل حقيبة الصحافة من press@fufuni.io أو قم بزيارة مستودع GitHub الخاص بنا.",
        },
        {
          heading: "التواصل الصحفي",
          body: "لاستفسارات الصحافة وطلبات المقابلات وإعلانات الشراكة، يرجى التواصل مع فريق الاتصالات لدينا على press@fufuni.io. نحن عادةً نرد خلال يوم عمل واحد.",
        },
      ],
    },
    "zh-CN": {
      title: "新闻与媒体",
      lead: "在这里找到撰写 Fufuni 报道所需的一切——我们的故事、品牌资产和新闻联系方式。",
      sections: [
        {
          heading: "关于 Fufuni",
          body: "Fufuni 是基于 Cloudflare Workers 和 Durable Objects 的新一代开源电商平台。成立于2024年，它使商家能够在无需任何基础设施管理的情况下部署全球分布式商店。平台原生支持多语言、多货币和多地区运营。",
        },
        {
          heading: "新闻资料包",
          body: "我们的新闻资料包包含高分辨率标志、产品截图、创始人简介和公司关键数据。请从 press@fufuni.io 下载新闻资料包或访问我们的 GitHub 仓库。",
        },
        {
          heading: "新闻联系",
          body: "如有新闻咨询、采访请求和合作公告，请联系我们的传播团队 press@fufuni.io。我们通常在一个工作日内回复。",
        },
      ],
    },
    "he-IL": {
      title: "עיתונות ומדיה",
      lead: "מצאו את כל המידע שאתם צריכים לכתיבה על Fufuni — הסיפור שלנו, נכסי המותג ואנשי קשר לעיתונות במקום אחד.",
      sections: [
        {
          heading: "על Fufuni",
          body: "Fufuni היא פלטפורמת מסחר אלקטרוני קוד פתוח מהדור הבא המבוססת על Cloudflare Workers ו-Durable Objects. נוסדה ב-2024, היא מאפשרת לסוחרים לפרוס חנויות מבוזרות גלובלית ללא ניהול תשתיות.",
        },
        {
          heading: "ערכת עיתונות",
          body: "ערכת העיתונות שלנו כוללת לוגואים ברזולוציה גבוהה, צילומי מסך של המוצר, ביוגרפיות של המייסדים ועובדות מפתח על החברה. הורידו את ערכת העיתונות מ-press@fufuni.io או בקרו במאגר ה-GitHub שלנו.",
        },
        {
          heading: "יצירת קשר עיתונאי",
          body: "לפניות עיתונאיות, בקשות לראיונות והכרזות על שותפויות, אנא פנו לצוות התקשורת שלנו בכתובת press@fufuni.io. אנחנו בדרך כלל מגיבים תוך יום עסקים אחד.",
        },
      ],
    },
  },

  // ─────────────────────────── CONTACT ────────────────────────────────────
  contact: {
    "en-US": {
      title: "Contact Us",
      lead: "We'd love to hear from you. Whether you have a question about the platform, need help with an order, or want to explore a partnership — we're here.",
      sections: [
        {
          heading: "Customer Support",
          body: "For order-related questions, shipping inquiries, and returns, reach out to our support team at support@fufuni.io. We aim to respond to all inquiries within 24 hours on business days.",
        },
        {
          heading: "Business Inquiries",
          body: "For partnerships, integrations, and enterprise inquiries, please contact us at hello@fufuni.io. We're always open to interesting collaborations with other platforms and merchants.",
        },
        {
          heading: "Support Hours",
          body: "Our support team is available Monday to Friday, 9:00 AM – 6:00 PM (CET). During peak periods such as holiday season, we extend our hours to ensure timely responses.",
        },
      ],
    },
    "fr-FR": {
      title: "Contactez-nous",
      lead: "Nous serions ravis d'avoir de vos nouvelles. Que vous ayez une question sur la plateforme, besoin d'aide pour une commande, ou souhaitiez explorer un partenariat — nous sommes là.",
      sections: [
        {
          heading: "Support client",
          body: "Pour les questions relatives aux commandes, aux expéditions et aux retours, contactez notre équipe de support à support@fufuni.io. Nous nous engageons à répondre à toutes les demandes dans les 24 heures les jours ouvrables.",
        },
        {
          heading: "Demandes commerciales",
          body: "Pour les partenariats, intégrations et demandes entreprises, veuillez nous contacter à hello@fufuni.io. Nous sommes toujours ouverts à des collaborations intéressantes avec d'autres plateformes et marchands.",
        },
        {
          heading: "Horaires du support",
          body: "Notre équipe de support est disponible du lundi au vendredi de 9h00 à 18h00 (CET). Pendant les périodes de pointe comme les fêtes, nous prolongeons nos horaires pour garantir des réponses rapides.",
        },
      ],
    },
    "es-ES": {
      title: "Contáctanos",
      lead: "Nos encantaría saber de ti. Ya sea que tengas una pregunta sobre la plataforma, necesites ayuda con un pedido, o quieras explorar una colaboración — estamos aquí.",
      sections: [
        {
          heading: "Soporte al cliente",
          body: "Para preguntas relacionadas con pedidos, envíos y devoluciones, contacta a nuestro equipo de soporte en support@fufuni.io. Nos comprometemos a responder todas las consultas en 24 horas en días hábiles.",
        },
        {
          heading: "Consultas de negocio",
          body: "Para asociaciones, integraciones y consultas empresariales, contáctanos en hello@fufuni.io. Siempre estamos abiertos a colaboraciones interesantes con otras plataformas y comerciantes.",
        },
        {
          heading: "Horario de soporte",
          body: "Nuestro equipo de soporte está disponible de lunes a viernes, de 9:00 a 18:00 (CET). Durante períodos de alta demanda como la temporada navideña, ampliamos nuestros horarios.",
        },
      ],
    },
    "ar-SA": {
      title: "تواصل معنا",
      lead: "يسعدنا سماعك. سواء كان لديك سؤال عن المنصة، أو تحتاج مساعدة في طلب، أو تريد استكشاف شراكة — نحن هنا.",
      sections: [
        {
          heading: "دعم العملاء",
          body: "للأسئلة المتعلقة بالطلبات والشحن والإرجاع، تواصل مع فريق الدعم لدينا على support@fufuni.io. نهدف للرد على جميع الاستفسارات خلال 24 ساعة في أيام العمل.",
        },
        {
          heading: "استفسارات الأعمال",
          body: "للشراكات والتكاملات والاستفسارات المؤسسية، يرجى التواصل معنا على hello@fufuni.io. نحن دائماً منفتحون على التعاون المثير مع منصات وتجار آخرين.",
        },
        {
          heading: "ساعات الدعم",
          body: "فريق الدعم لدينا متاح من الاثنين إلى الجمعة، من 9:00 صباحاً حتى 6:00 مساءً (توقيت وسط أوروبا). خلال فترات الذروة كموسم الأعياد، نمدد ساعاتنا لضمان الردود في الوقت المناسب.",
        },
      ],
    },
    "zh-CN": {
      title: "联系我们",
      lead: "我们很乐意听取您的意见。无论您对平台有疑问、需要订单帮助或想探讨合作——我们都在这里。",
      sections: [
        {
          heading: "客户支持",
          body: "如有订单相关问题、运输咨询和退货请求，请联系我们的支持团队 support@fufuni.io。我们承诺在工作日24小时内回复所有咨询。",
        },
        {
          heading: "商务咨询",
          body: "如有合作、集成和企业咨询，请联系 hello@fufuni.io。我们始终乐于与其他平台和商家探索有趣的合作机会。",
        },
        {
          heading: "支持时间",
          body: "我们的支持团队工作时间为周一至周五上午9:00至下午6:00（中欧时间）。在假日季等高峰期，我们会延长工作时间确保及时响应。",
        },
      ],
    },
    "he-IL": {
      title: "צרו קשר",
      lead: "נשמח לשמוע מכם. בין אם יש לכם שאלה על הפלטפורמה, צורך בעזרה עם הזמנה, או עניין לחקור שותפות — אנחנו כאן.",
      sections: [
        {
          heading: "תמיכת לקוחות",
          body: "לשאלות הקשורות להזמנות, משלוחים והחזרות, פנו לצוות התמיכה שלנו בכתובת support@fufuni.io. אנחנו שואפים להגיב לכל הפניות תוך 24 שעות בימי עסקים.",
        },
        {
          heading: "פניות עסקיות",
          body: "לשותפויות, אינטגרציות ופניות ארגוניות, אנא פנו אלינו בכתובת hello@fufuni.io. אנחנו תמיד פתוחים לשיתופי פעולה מעניינים עם פלטפורמות וסוחרים אחרים.",
        },
        {
          heading: "שעות תמיכה",
          body: "צוות התמיכה שלנו זמין מיום שני עד שישי, 9:00–18:00 (שעון מרכז אירופה). בתקופות שיא כמו עונת החגים, אנחנו מאריכים את שעות הפעילות.",
        },
      ],
    },
  },

  // ─────────────────────────── FAQ ────────────────────────────────────────
  faq: {
    "en-US": {
      title: "Frequently Asked Questions",
      lead: "Everything you need to know about shopping with us — orders, payments, shipping, and returns.",
      sections: [
        {
          heading: "Shipping & Delivery",
          body: "Standard delivery takes 3–5 business days. Express delivery (1–2 business days) is available at checkout. Free shipping applies to orders over €50. International orders may take 7–14 business days depending on the destination country and local customs clearance.",
        },
        {
          heading: "Returns & Refunds",
          body: "We accept returns within 30 days of delivery, provided items are unused and in original packaging. To initiate a return, log into your account and visit the orders section. Refunds are processed within 5–7 business days after we receive the returned item.",
        },
        {
          heading: "Payments",
          body: "We accept Visa, Mastercard, PayPal, Stripe, and Apple Pay. All transactions are secured with TLS encryption. We do not store card information — payments are handled entirely by our certified payment processors.",
        },
      ],
    },
    "fr-FR": {
      title: "Questions Fréquentes",
      lead: "Tout ce que vous devez savoir sur vos achats — commandes, paiements, livraisons et retours.",
      sections: [
        {
          heading: "Livraison et expédition",
          body: "La livraison standard prend 3 à 5 jours ouvrables. La livraison express (1 à 2 jours ouvrables) est disponible lors du passage en caisse. La livraison gratuite s'applique aux commandes supérieures à 50 €. Les commandes internationales peuvent prendre 7 à 14 jours ouvrables selon le pays de destination.",
        },
        {
          heading: "Retours et remboursements",
          body: "Nous acceptons les retours dans les 30 jours suivant la livraison, à condition que les articles soient inutilisés et dans leur emballage d'origine. Pour initier un retour, connectez-vous à votre compte et consultez la section commandes. Les remboursements sont traités dans un délai de 5 à 7 jours ouvrables.",
        },
        {
          heading: "Paiements",
          body: "Nous acceptons Visa, Mastercard, PayPal, Stripe et Apple Pay. Toutes les transactions sont sécurisées par chiffrement TLS. Nous ne stockons pas les informations de carte — les paiements sont entièrement gérés par nos processeurs de paiement certifiés.",
        },
      ],
    },
    "es-ES": {
      title: "Preguntas Frecuentes",
      lead: "Todo lo que necesitas saber sobre tus compras — pedidos, pagos, envíos y devoluciones.",
      sections: [
        {
          heading: "Envío y entrega",
          body: "El envío estándar tarda de 3 a 5 días hábiles. El envío express (1-2 días hábiles) está disponible al finalizar la compra. El envío gratuito aplica a pedidos superiores a 50 €. Los pedidos internacionales pueden tardar de 7 a 14 días hábiles.",
        },
        {
          heading: "Devoluciones y reembolsos",
          body: "Aceptamos devoluciones dentro de los 30 días posteriores a la entrega, siempre que los artículos estén sin usar y en su embalaje original. Para iniciar una devolución, inicia sesión en tu cuenta y visita la sección de pedidos. Los reembolsos se procesan en 5-7 días hábiles.",
        },
        {
          heading: "Pagos",
          body: "Aceptamos Visa, Mastercard, PayPal, Stripe y Apple Pay. Todas las transacciones están protegidas con encriptación TLS. No almacenamos información de tarjetas — los pagos son gestionados enteramente por nuestros procesadores de pago certificados.",
        },
      ],
    },
    "ar-SA": {
      title: "الأسئلة الشائعة",
      lead: "كل ما تحتاج معرفته عن التسوق معنا — الطلبات والمدفوعات والشحن والإرجاع.",
      sections: [
        {
          heading: "الشحن والتسليم",
          body: "يستغرق التسليم القياسي من 3 إلى 5 أيام عمل. التسليم السريع (يوم إلى يومين عمل) متاح عند الدفع. الشحن مجاني للطلبات التي تزيد عن 50 يورو. قد تستغرق الطلبات الدولية من 7 إلى 14 يوم عمل.",
        },
        {
          heading: "الإرجاع والاسترداد",
          body: "نقبل الإرجاع خلال 30 يوماً من التسليم، شريطة أن تكون المنتجات غير مستخدمة وفي عبوتها الأصلية. لبدء الإرجاع، سجل دخولك إلى حسابك وانتقل إلى قسم الطلبات. تتم معالجة المبالغ المستردة في غضون 5 إلى 7 أيام عمل.",
        },
        {
          heading: "طرق الدفع",
          body: "نقبل Visa وMastercard وPayPal وStripe وApple Pay. جميع المعاملات محمية بتشفير TLS. لا نحتفظ بمعلومات البطاقة — تتم معالجة المدفوعات بالكامل من قبل معالجي الدفع المعتمدين لدينا.",
        },
      ],
    },
    "zh-CN": {
      title: "常见问题",
      lead: "您需要了解的关于购物的一切——订单、付款、配送和退货。",
      sections: [
        {
          heading: "配送与交付",
          body: "标准配送需要3-5个工作日。结账时可选择快递配送（1-2个工作日）。订单满50欧元免运费。国际订单根据目的地国家和当地清关可能需要7-14个工作日。",
        },
        {
          heading: "退货与退款",
          body: "我们接受交付后30天内的退货，前提是商品未使用且保持原始包装。要发起退货，请登录您的账户并访问订单部分。退款将在我们收到退回商品后5-7个工作日内处理。",
        },
        {
          heading: "支付方式",
          body: "我们接受Visa、Mastercard、PayPal、Stripe和Apple Pay。所有交易均通过TLS加密保护。我们不存储卡片信息——付款完全由我们经认证的支付处理商处理。",
        },
      ],
    },
    "he-IL": {
      title: "שאלות נפוצות",
      lead: "כל מה שצריך לדעת על קניות אצלנו — הזמנות, תשלומים, משלוחים והחזרות.",
      sections: [
        {
          heading: "משלוח ואספקה",
          body: "משלוח סטנדרטי לוקח 3-5 ימי עסקים. משלוח אקספרס (1-2 ימי עסקים) זמין בעת התשלום. משלוח חינם להזמנות מעל 50 יורו. הזמנות בינלאומיות עשויות לקחת 7-14 ימי עסקים.",
        },
        {
          heading: "החזרות והחזרי כספים",
          body: "אנחנו מקבלים החזרות תוך 30 יום מהמסירה, בתנאי שהפריטים לא שומשו ובאריזה המקורית. להתחלת החזרה, התחברו לחשבונכם ובקרו בחלק ההזמנות. החזרים מעובדים תוך 5-7 ימי עסקים.",
        },
        {
          heading: "תשלומים",
          body: "אנחנו מקבלים Visa, Mastercard, PayPal, Stripe ו-Apple Pay. כל העסקאות מאובטחות בהצפנת TLS. אנחנו לא שומרים פרטי כרטיס — התשלומים מטופלים לחלוטין על ידי מעבדי התשלומים המוסמכים שלנו.",
        },
      ],
    },
  },

  // ─────────────────────────── SHIPPING POLICY ────────────────────────────
  "shipping-policy": {
    "en-US": {
      title: "Shipping Policy",
      lead: "We are committed to delivering your orders quickly, safely, and at a fair price. Here is everything you need to know about how we ship.",
      sections: [
        {
          heading: "Order Processing",
          body: "Orders are processed within 1–2 business days of payment confirmation. Orders placed on weekends or public holidays are processed on the next business day. You will receive a confirmation email with tracking information once your order ships.",
        },
        {
          heading: "Delivery Methods & Rates",
          body: "Standard shipping (3–5 business days) is free on orders over €50, and €4.99 for smaller orders. Express shipping (1–2 business days) is available for €9.99. Same-day delivery is offered in selected cities at a surcharge.",
        },
        {
          heading: "International Shipping",
          body: "We ship to over 50 countries worldwide. International delivery typically takes 7–14 business days. Import duties and taxes may apply upon arrival and are the responsibility of the recipient. We are not liable for delays caused by customs.",
        },
      ],
    },
    "fr-FR": {
      title: "Politique de livraison",
      lead: "Nous nous engageons à livrer vos commandes rapidement, en toute sécurité et à un prix équitable. Voici tout ce que vous devez savoir sur notre mode d'expédition.",
      sections: [
        {
          heading: "Traitement des commandes",
          body: "Les commandes sont traitées dans un délai de 1 à 2 jours ouvrables suivant la confirmation du paiement. Les commandes passées les week-ends ou les jours fériés sont traitées le prochain jour ouvrable. Vous recevrez un e-mail de confirmation avec les informations de suivi dès l'expédition.",
        },
        {
          heading: "Modes de livraison et tarifs",
          body: "La livraison standard (3 à 5 jours ouvrables) est gratuite pour les commandes supérieures à 50 € et coûte 4,99 € pour les commandes moins importantes. La livraison express (1 à 2 jours ouvrables) est disponible à 9,99 €.",
        },
        {
          heading: "Livraison internationale",
          body: "Nous livrons dans plus de 50 pays dans le monde. La livraison internationale prend généralement 7 à 14 jours ouvrables. Des droits de douane et taxes peuvent s'appliquer à l'arrivée et sont à la charge du destinataire.",
        },
      ],
    },
    "es-ES": {
      title: "Política de Envío",
      lead: "Estamos comprometidos a entregar tus pedidos de forma rápida, segura y a un precio justo. Aquí tienes todo lo que necesitas saber sobre cómo enviamos.",
      sections: [
        {
          heading: "Procesamiento de pedidos",
          body: "Los pedidos se procesan en 1-2 días hábiles tras la confirmación del pago. Los pedidos realizados en fines de semana o días festivos se procesan el siguiente día hábil. Recibirás un email de confirmación con información de seguimiento una vez enviado tu pedido.",
        },
        {
          heading: "Métodos y tarifas de envío",
          body: "El envío estándar (3-5 días hábiles) es gratuito en pedidos superiores a €50 y cuesta €4,99 para pedidos menores. El envío express (1-2 días hábiles) está disponible por €9,99.",
        },
        {
          heading: "Envío internacional",
          body: "Enviamos a más de 50 países en todo el mundo. La entrega internacional suele tardar de 7 a 14 días hábiles. Los aranceles e impuestos de importación pueden aplicarse a la llegada y son responsabilidad del destinatario.",
        },
      ],
    },
    "ar-SA": {
      title: "سياسة الشحن",
      lead: "نلتزم بتسليم طلباتك بسرعة وأمان وبسعر عادل. إليك كل ما تحتاج معرفته حول طريقة شحننا.",
      sections: [
        {
          heading: "معالجة الطلبات",
          body: "تتم معالجة الطلبات في غضون يوم إلى يومين عمل بعد تأكيد الدفع. تتم معالجة الطلبات المقدمة في عطلات نهاية الأسبوع أو أيام العطل العامة في يوم العمل التالي. ستتلقى بريداً إلكترونياً للتأكيد مع معلومات التتبع بمجرد شحن طلبك.",
        },
        {
          heading: "طرق الشحن والأسعار",
          body: "الشحن القياسي (3 إلى 5 أيام عمل) مجاني للطلبات التي تزيد عن 50 يورو وبسعر 4.99 يورو للطلبات الأصغر. الشحن السريع (يوم إلى يومين عمل) متاح مقابل 9.99 يورو.",
        },
        {
          heading: "الشحن الدولي",
          body: "نشحن إلى أكثر من 50 دولة حول العالم. يستغرق التسليم الدولي عادةً من 7 إلى 14 يوم عمل. قد تُطبَّق رسوم جمركية وضرائب عند الوصول وهي مسؤولية المستلم.",
        },
      ],
    },
    "zh-CN": {
      title: "配送政策",
      lead: "我们致力于快速、安全地以合理价格配送您的订单。以下是您需要了解的关于我们配送方式的一切。",
      sections: [
        {
          heading: "订单处理",
          body: "订单在付款确认后1-2个工作日内处理。周末或公共假期下单的订单将在下一个工作日处理。订单发货后，您将收到包含跟踪信息的确认电子邮件。",
        },
        {
          heading: "配送方式与费率",
          body: "标准配送（3-5个工作日）在订单满50欧元时免费，小额订单收费4.99欧元。快递配送（1-2个工作日）收费9.99欧元。部分城市提供当日达服务，需支付附加费。",
        },
        {
          heading: "国际配送",
          body: "我们向全球50多个国家发货。国际配送通常需要7-14个工作日。到达时可能需要支付进口关税和税费，由收件人负责。我们对海关造成的延误不承担责任。",
        },
      ],
    },
    "he-IL": {
      title: "מדיניות משלוחים",
      lead: "אנחנו מחויבים לספק את ההזמנות שלכם במהירות, בבטחה ובמחיר הוגן. הנה כל מה שצריך לדעת על אופן המשלוח שלנו.",
      sections: [
        {
          heading: "עיבוד הזמנות",
          body: "הזמנות מעובדות תוך 1-2 ימי עסקים מאישור התשלום. הזמנות שנמסרו בסופי שבוע או ימי חג יעובדו ביום העסקים הבא. תקבלו אימייל אישור עם פרטי מעקב ברגע שההזמנה נשלחת.",
        },
        {
          heading: "שיטות משלוח ותעריפים",
          body: "משלוח סטנדרטי (3-5 ימי עסקים) חינמי בהזמנות מעל 50 יורו ועולה 4.99 יורו להזמנות קטנות יותר. משלוח אקספרס (1-2 ימי עסקים) זמין ב-9.99 יורו.",
        },
        {
          heading: "משלוח בינלאומי",
          body: "אנחנו שולחים ליותר מ-50 מדינות ברחבי העולם. אספקה בינלאומית לוקחת בדרך כלל 7-14 ימי עסקים. מכס ומסים עשויים לחול עם הגעה והם באחריות הנמען.",
        },
      ],
    },
  },

  // ─────────────────────────── RETURNS POLICY ─────────────────────────────
  "returns-policy": {
    "en-US": {
      title: "Returns & Refunds Policy",
      lead: "Your satisfaction is our priority. If you are not fully satisfied with your purchase, we make it easy to return items and get a refund.",
      sections: [
        {
          heading: "Return Window & Conditions",
          body: "You may return any item within 30 days of receipt. Items must be unused, undamaged, and in their original packaging with all tags attached. Personalized, digital, and perishable products cannot be returned.",
        },
        {
          heading: "How to Return an Item",
          body: "Log into your account, navigate to your order history, and select the item you wish to return. You will receive a prepaid return label by email within 24 hours. Drop the package at any authorized carrier location.",
        },
        {
          heading: "Refunds",
          body: "Once we receive and inspect your return, we will issue a refund to your original payment method within 5–7 business days. You will receive an email confirmation when the refund is processed. Shipping costs are refunded only if the return is due to our error.",
        },
      ],
    },
    "fr-FR": {
      title: "Politique de Retours et Remboursements",
      lead: "Votre satisfaction est notre priorité. Si vous n'êtes pas entièrement satisfait de votre achat, nous facilitons le retour des articles et le remboursement.",
      sections: [
        {
          heading: "Délai et conditions de retour",
          body: "Vous pouvez retourner tout article dans les 30 jours suivant la réception. Les articles doivent être inutilisés, non endommagés et dans leur emballage d'origine avec toutes les étiquettes attachées. Les produits personnalisés, numériques et périssables ne peuvent pas être retournés.",
        },
        {
          heading: "Comment retourner un article",
          body: "Connectez-vous à votre compte, accédez à votre historique de commandes et sélectionnez l'article que vous souhaitez retourner. Vous recevrez une étiquette de retour prépayée par e-mail dans les 24 heures.",
        },
        {
          heading: "Remboursements",
          body: "Une fois que nous aurons reçu et inspecté votre retour, nous effectuerons un remboursement sur votre moyen de paiement d'origine dans un délai de 5 à 7 jours ouvrables. Les frais de livraison ne sont remboursés qu'en cas d'erreur de notre part.",
        },
      ],
    },
    "es-ES": {
      title: "Política de Devoluciones y Reembolsos",
      lead: "Tu satisfacción es nuestra prioridad. Si no estás completamente satisfecho con tu compra, hemos facilitado el proceso de devolución y reembolso.",
      sections: [
        {
          heading: "Plazo y condiciones de devolución",
          body: "Puedes devolver cualquier artículo dentro de los 30 días posteriores a la recepción. Los artículos deben estar sin usar, sin daños y en su embalaje original con todas las etiquetas puestas. Los productos personalizados, digitales y perecederos no pueden devolverse.",
        },
        {
          heading: "Cómo devolver un artículo",
          body: "Inicia sesión en tu cuenta, navega al historial de pedidos y selecciona el artículo que deseas devolver. Recibirás una etiqueta de devolución prepagada por email en 24 horas.",
        },
        {
          heading: "Reembolsos",
          body: "Una vez que recibamos e inspeccionemos tu devolución, emitiremos un reembolso en tu método de pago original en 5-7 días hábiles. Los costos de envío solo se reembolsan si la devolución se debe a un error nuestro.",
        },
      ],
    },
    "ar-SA": {
      title: "سياسة الإرجاع والاسترداد",
      lead: "رضاك هو أولويتنا. إذا لم تكن راضياً تماماً عن عملية الشراء، نجعل من السهل إعادة المنتجات والحصول على استرداد.",
      sections: [
        {
          heading: "فترة الإرجاع والشروط",
          body: "يمكنك إعادة أي منتج في غضون 30 يوماً من الاستلام. يجب أن تكون المنتجات غير مستخدمة وغير تالفة وفي عبوتها الأصلية مع جميع البطاقات المرفقة. لا يمكن إعادة المنتجات الشخصية والرقمية والقابلة للتلف.",
        },
        {
          heading: "كيفية إعادة منتج",
          body: "قم بتسجيل الدخول إلى حسابك وانتقل إلى سجل طلباتك وحدد المنتج الذي ترغب في إعادته. ستستلم ملصق إعادة مدفوع مسبقاً عبر البريد الإلكتروني في غضون 24 ساعة.",
        },
        {
          heading: "المبالغ المستردة",
          body: "بمجرد استلام وفحص إعادتك، سنصدر استرداداً إلى طريقة الدفع الأصلية في غضون 5 إلى 7 أيام عمل. تُسترد تكاليف الشحن فقط إذا كانت الإعادة بسبب خطأ من جانبنا.",
        },
      ],
    },
    "zh-CN": {
      title: "退货与退款政策",
      lead: "您的满意是我们的首要任务。如果您对购买不完全满意，我们让退货和退款变得简单。",
      sections: [
        {
          heading: "退货期限和条件",
          body: "您可以在收货后30天内退还任何商品。商品必须未使用、未损坏，并保持原始包装，附上所有标签。个性化、数字和易腐商品不可退货。",
        },
        {
          heading: "如何退货",
          body: "登录您的账户，进入订单历史，选择您希望退货的商品。您将在24小时内通过电子邮件收到预付费退货标签。将包裹送至任何授权承运商处即可。",
        },
        {
          heading: "退款",
          body: "一旦我们收到并检查您的退货，将在5-7个工作日内将退款退至您的原始付款方式。退款处理后您将收到确认邮件。运费仅在退货由于我们的错误时才予以退还。",
        },
      ],
    },
    "he-IL": {
      title: "מדיניות החזרות והחזרי כספים",
      lead: "שביעות הרצון שלכם היא העדיפות שלנו. אם אינכם מרוצים לחלוטין מהרכישה שלכם, אנחנו עושים את ההחזרה וההחזר כספי לפשוטים.",
      sections: [
        {
          heading: "תקופת החזרה ותנאים",
          body: "ניתן להחזיר כל פריט תוך 30 יום מהקבלה. פריטים חייבים להיות לא בשימוש, לא פגומים ובאריזה המקורית עם כל התגיות מחוברות. מוצרים מותאמים אישית, דיגיטליים ומתכלים אינם ניתנים להחזרה.",
        },
        {
          heading: "איך להחזיר פריט",
          body: "התחברו לחשבונכם, נווטו להיסטוריית ההזמנות ובחרו את הפריט שברצונכם להחזיר. תקבלו תווית החזרה ממומנת מראש באימייל תוך 24 שעות.",
        },
        {
          heading: "החזרי כספים",
          body: "לאחר שנקבל ונבדוק את ההחזרה שלכם, נוציא החזר כספי לאמצעי התשלום המקורי תוך 5-7 ימי עסקים. עלויות משלוח מוחזרות רק אם ההחזרה נובעת מטעות שלנו.",
        },
      ],
    },
  },

  // ─────────────────────────── PRIVACY POLICY ─────────────────────────────
  "privacy-policy": {
    "en-US": {
      title: "Privacy Policy",
      lead: "Your privacy matters to us. This policy explains what data we collect, why we collect it, and how you can control it. Last updated: January 1, 2026.",
      sections: [
        {
          heading: "Data We Collect",
          body: "We collect information you provide directly — such as your name, email address, shipping address, and payment details when placing an order. We also collect usage data automatically, including your IP address, browser type, pages visited, and the items you view or add to your cart.",
        },
        {
          heading: "How We Use Your Data",
          body: "We use your data to process orders, provide customer support, send transactional emails (order confirmations, shipping updates), and improve our platform. With your explicit consent, we may also send you marketing communications. We never sell your personal data to third parties.",
        },
        {
          heading: "Your Rights",
          body: "Under applicable data protection law (GDPR, CCPA), you have the right to access, correct, delete, or export your personal data. You may also withdraw consent for marketing at any time. To exercise your rights, contact us at privacy@fufuni.io. We will respond within 30 days.",
        },
      ],
    },
    "fr-FR": {
      title: "Politique de confidentialité",
      lead: "Votre vie privée est importante pour nous. Cette politique explique quelles données nous collectons, pourquoi nous les collectons et comment vous pouvez les contrôler. Dernière mise à jour : 1er janvier 2026.",
      sections: [
        {
          heading: "Données que nous collectons",
          body: "Nous collectons les informations que vous fournissez directement — comme votre nom, adresse e-mail, adresse de livraison et coordonnées de paiement lors d'une commande. Nous collectons également des données d'utilisation automatiquement, notamment votre adresse IP, type de navigateur et pages visitées.",
        },
        {
          heading: "Comment nous utilisons vos données",
          body: "Nous utilisons vos données pour traiter les commandes, fournir un support client, envoyer des e-mails transactionnels et améliorer notre plateforme. Avec votre consentement explicite, nous pouvons également vous envoyer des communications marketing. Nous ne vendons jamais vos données personnelles à des tiers.",
        },
        {
          heading: "Vos droits",
          body: "En vertu du RGPD, vous avez le droit d'accéder, de corriger, de supprimer ou d'exporter vos données personnelles. Vous pouvez également retirer votre consentement aux communications marketing à tout moment. Pour exercer vos droits, contactez-nous à privacy@fufuni.io.",
        },
      ],
    },
    "es-ES": {
      title: "Política de Privacidad",
      lead: "Tu privacidad nos importa. Esta política explica qué datos recopilamos, por qué los recopilamos y cómo puedes controlarlos. Última actualización: 1 de enero de 2026.",
      sections: [
        {
          heading: "Datos que recopilamos",
          body: "Recopilamos información que proporcionas directamente — como tu nombre, dirección de email, dirección de envío y datos de pago al realizar un pedido. También recopilamos datos de uso automáticamente, incluida tu dirección IP, tipo de navegador y páginas visitadas.",
        },
        {
          heading: "Cómo usamos tus datos",
          body: "Usamos tus datos para procesar pedidos, brindar soporte al cliente, enviar emails transaccionales y mejorar nuestra plataforma. Con tu consentimiento explícito, también podemos enviarte comunicaciones de marketing. Nunca vendemos tus datos personales a terceros.",
        },
        {
          heading: "Tus derechos",
          body: "Bajo el RGPD y las leyes de protección de datos aplicables, tienes derecho a acceder, corregir, eliminar o exportar tus datos personales. También puedes retirar el consentimiento para marketing en cualquier momento. Contáctanos en privacy@fufuni.io.",
        },
      ],
    },
    "ar-SA": {
      title: "سياسة الخصوصية",
      lead: "خصوصيتك مهمة لنا. توضح هذه السياسة البيانات التي نجمعها ولماذا نجمعها وكيف يمكنك التحكم فيها. آخر تحديث: 1 يناير 2026.",
      sections: [
        {
          heading: "البيانات التي نجمعها",
          body: "نجمع المعلومات التي تقدمها مباشرة — مثل اسمك وعنوان بريدك الإلكتروني وعنوان الشحن وتفاصيل الدفع عند تقديم طلب. كما نجمع بيانات الاستخدام تلقائياً، بما في ذلك عنوان IP الخاص بك ونوع المتصفح والصفحات التي زرتها.",
        },
        {
          heading: "كيف نستخدم بياناتك",
          body: "نستخدم بياناتك لمعالجة الطلبات وتقديم دعم العملاء وإرسال رسائل بريد إلكتروني للمعاملات وتحسين منصتنا. بموافقتك الصريحة، قد نرسل إليك أيضاً اتصالات تسويقية. لا نبيع أبداً بياناتك الشخصية لأطراف ثالثة.",
        },
        {
          heading: "حقوقك",
          body: "بموجب قوانين حماية البيانات المعمول بها، لديك الحق في الوصول إلى بياناتك الشخصية وتصحيحها وحذفها أو تصديرها. يمكنك أيضاً سحب الموافقة على التسويق في أي وقت. للممارسة حقوقك، تواصل معنا على privacy@fufuni.io.",
        },
      ],
    },
    "zh-CN": {
      title: "隐私政策",
      lead: "您的隐私对我们很重要。本政策解释了我们收集哪些数据、为何收集以及您如何控制这些数据。最后更新：2026年1月1日。",
      sections: [
        {
          heading: "我们收集的数据",
          body: "我们收集您直接提供的信息——例如您下订单时的姓名、电子邮件地址、送货地址和付款详情。我们还会自动收集使用数据，包括您的IP地址、浏览器类型、访问页面以及您查看或添加到购物车的商品。",
        },
        {
          heading: "我们如何使用您的数据",
          body: "我们使用您的数据处理订单、提供客户支持、发送交易电子邮件并改进我们的平台。在您明确同意的情况下，我们也可能向您发送营销通讯。我们绝不向第三方出售您的个人数据。",
        },
        {
          heading: "您的权利",
          body: "根据适用的数据保护法（GDPR等），您有权访问、更正、删除或导出您的个人数据。您也可以随时撤回营销同意。请联系 privacy@fufuni.io 行使您的权利，我们将在30天内回复。",
        },
      ],
    },
    "he-IL": {
      title: "מדיניות פרטיות",
      lead: "הפרטיות שלכם חשובה לנו. מדיניות זו מסבירה אילו נתונים אנחנו אוספים, מדוע אנחנו אוספים אותם וכיצד תוכלו לשלוט בהם. עדכון אחרון: 1 בינואר 2026.",
      sections: [
        {
          heading: "נתונים שאנחנו אוספים",
          body: "אנחנו אוספים מידע שאתם מספקים ישירות — כמו שמכם, כתובת האימייל, כתובת המשלוח ופרטי התשלום בעת ביצוע הזמנה. אנחנו גם אוספים נתוני שימוש אוטומטית, כולל כתובת ה-IP שלכם, סוג הדפדפן ודפים שביקרתם.",
        },
        {
          heading: "איך אנחנו משתמשים בנתונים שלכם",
          body: "אנחנו משתמשים בנתונים שלכם לעיבוד הזמנות, מתן תמיכת לקוחות, שליחת אימיילי עסקאות ושיפור הפלטפורמה שלנו. בהסכמתכם המפורשת, נוכל גם לשלוח לכם תקשורות שיווקיות. אנחנו לעולם לא מוכרים את נתוניכם האישיים לצדדים שלישיים.",
        },
        {
          heading: "הזכויות שלכם",
          body: "לפי חוקי הגנת הנתונים הרלוונטיים (GDPR), יש לכם זכות לגשת, לתקן, למחוק או לייצא את הנתונים האישיים שלכם. תוכלו גם לבטל הסכמה לשיווק בכל עת. לממוש זכויותיכם, צרו קשר ב-privacy@fufuni.io.",
        },
      ],
    },
  },

  // ─────────────────────────── TERMS OF SERVICE ───────────────────────────
  "terms-of-service": {
    "en-US": {
      title: "Terms of Service",
      lead: "By accessing or using Fufuni, you agree to be bound by these Terms of Service. Please read them carefully. Last updated: January 1, 2026.",
      sections: [
        {
          heading: "Use of the Platform",
          body: "You may use our platform for lawful purposes only. You agree not to use Fufuni for any fraudulent activities, to transmit harmful or illegal content, or to violate any applicable laws. We reserve the right to terminate access for users who breach these terms.",
        },
        {
          heading: "Orders, Payments & Pricing",
          body: "All prices displayed are inclusive of applicable taxes unless otherwise stated. We reserve the right to modify prices at any time. An order is not confirmed until payment is successfully processed. We are not liable for pricing errors due to technical glitches, and we reserve the right to cancel any incorrectly priced orders.",
        },
        {
          heading: "Limitation of Liability",
          body: "To the fullest extent permitted by law, Fufuni shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform. Our total liability shall not exceed the amount paid by you for the specific order giving rise to the claim.",
        },
      ],
    },
    "fr-FR": {
      title: "Conditions Générales de Vente",
      lead: "En accédant à Fufuni ou en l'utilisant, vous acceptez d'être lié par ces Conditions générales. Veuillez les lire attentivement. Dernière mise à jour : 1er janvier 2026.",
      sections: [
        {
          heading: "Utilisation de la plateforme",
          body: "Vous pouvez utiliser notre plateforme à des fins légales uniquement. Vous vous engagez à ne pas utiliser Fufuni pour des activités frauduleuses, transmettre du contenu nuisible ou illégal, ou violer les lois applicables. Nous nous réservons le droit de résilier l'accès des utilisateurs qui enfreignent ces conditions.",
        },
        {
          heading: "Commandes, paiements et tarification",
          body: "Tous les prix affichés incluent les taxes applicables sauf indication contraire. Nous nous réservons le droit de modifier les prix à tout moment. Une commande n'est confirmée que lorsque le paiement est traité avec succès. Nous nous réservons le droit d'annuler toute commande avec un prix incorrect.",
        },
        {
          heading: "Limitation de responsabilité",
          body: "Dans toute la mesure permise par la loi, Fufuni ne sera pas responsable des dommages indirects, accessoires, spéciaux ou consécutifs découlant de votre utilisation de la plateforme. Notre responsabilité totale ne dépassera pas le montant que vous avez payé pour votre commande.",
        },
      ],
    },
    "es-ES": {
      title: "Términos y Condiciones",
      lead: "Al acceder o usar Fufuni, aceptas estar sujeto a estos Términos de Servicio. Por favor léelos detenidamente. Última actualización: 1 de enero de 2026.",
      sections: [
        {
          heading: "Uso de la plataforma",
          body: "Solo puedes usar nuestra plataforma para fines legales. Aceptas no usar Fufuni para actividades fraudulentas, transmitir contenido dañino o ilegal, ni violar ninguna ley aplicable. Nos reservamos el derecho de cancelar el acceso a usuarios que incumplan estos términos.",
        },
        {
          heading: "Pedidos, pagos y precios",
          body: "Todos los precios mostrados incluyen los impuestos aplicables salvo que se indique lo contrario. Nos reservamos el derecho de modificar los precios en cualquier momento. Un pedido no está confirmado hasta que el pago se procesa correctamente.",
        },
        {
          heading: "Limitación de responsabilidad",
          body: "En la máxima medida permitida por la ley, Fufuni no será responsable de ningún daño indirecto, incidental, especial o consecuente que surja del uso de la plataforma. Nuestra responsabilidad total no excederá el importe pagado por tu pedido.",
        },
      ],
    },
    "ar-SA": {
      title: "شروط الخدمة",
      lead: "بالوصول إلى فوفوني أو استخدامها، فإنك توافق على الالتزام بشروط الخدمة هذه. يرجى قراءتها بعناية. آخر تحديث: 1 يناير 2026.",
      sections: [
        {
          heading: "استخدام المنصة",
          body: "يمكنك استخدام منصتنا للأغراض القانونية فقط. تتفق على عدم استخدام فوفوني لأي أنشطة احتيالية أو نقل محتوى ضار أو غير قانوني أو انتهاك أي قوانين معمول بها. نحتفظ بالحق في إنهاء الوصول للمستخدمين الذين ينتهكون هذه الشروط.",
        },
        {
          heading: "الطلبات والمدفوعات والتسعير",
          body: "جميع الأسعار المعروضة شاملة للضرائب المعمول بها ما لم ينص على خلاف ذلك. نحتفظ بالحق في تعديل الأسعار في أي وقت. لا يُؤكَّد الطلب إلا عند معالجة الدفع بنجاح.",
        },
        {
          heading: "تحديد المسؤولية",
          body: "بالقدر الكامل المسموح به بموجب القانون، لن تكون فوفوني مسؤولة عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية ناشئة عن استخدامك للمنصة. لن تتجاوز مسؤوليتنا الإجمالية المبلغ الذي دفعته مقابل طلبك.",
        },
      ],
    },
    "zh-CN": {
      title: "服务条款",
      lead: "通过访问或使用 Fufuni，您同意受这些服务条款的约束。请仔细阅读。最后更新：2026年1月1日。",
      sections: [
        {
          heading: "平台使用",
          body: "您只能为合法目的使用我们的平台。您同意不将 Fufuni 用于任何欺诈活动、传播有害或非法内容，或违反任何适用法律。我们保留对违反这些条款的用户终止访问权限的权利。",
        },
        {
          heading: "订单、付款和定价",
          body: "除非另有说明，所有显示的价格均含适用税款。我们保留随时修改价格的权利。只有付款成功处理后，订单才被确认。我们保留取消任何错误定价订单的权利。",
        },
        {
          heading: "责任限制",
          body: "在法律允许的最大范围内，Fufuni 对因使用平台而产生的任何间接、附带、特殊或后果性损害不承担责任。我们的总责任不超过您为具体订单支付的金额。",
        },
      ],
    },
    "he-IL": {
      title: "תנאי שירות",
      lead: "על ידי גישה ל-Fufuni או שימוש בו, אתם מסכימים להיות מחויבים לתנאי שירות אלה. אנא קראו אותם בעיון. עדכון אחרון: 1 בינואר 2026.",
      sections: [
        {
          heading: "שימוש בפלטפורמה",
          body: "תוכלו להשתמש בפלטפורמה שלנו למטרות חוקיות בלבד. אתם מסכימים לא להשתמש ב-Fufuni לפעילויות הונאה, להעביר תוכן מזיק או בלתי חוקי, או להפר כל חוק חל. אנו שומרים לעצמנו את הזכות לסיים גישה למשתמשים המפרים תנאים אלה.",
        },
        {
          heading: "הזמנות, תשלומים ותמחור",
          body: "כל המחירים המוצגים כוללים מסים רלוונטיים אלא אם צוין אחרת. אנחנו שומרים לעצמנו את הזכות לשנות מחירים בכל עת. הזמנה אינה מאושרת עד לעיבוד מוצלח של התשלום.",
        },
        {
          heading: "הגבלת אחריות",
          body: "במידה המרבית המותרת בחוק, Fufuni לא תהיה אחראית לנזקים עקיפים, מקריים, מיוחדים או תוצאתיים הנובעים מהשימוש שלכם בפלטפורמה. האחריות הכוללת שלנו לא תעלה על הסכום ששילמתם עבור ההזמנה הספציפית.",
        },
      ],
    },
  },

  // ─────────────────────────── COOKIE POLICY ──────────────────────────────
  "cookie-policy": {
    "en-US": {
      title: "Cookie Policy",
      lead: "This Cookie Policy explains how Fufuni uses cookies and similar tracking technologies on our website. Last updated: January 1, 2026.",
      sections: [
        {
          heading: "What Are Cookies?",
          body: "Cookies are small text files placed on your device when you visit a website. They help the site remember your preferences, keep you logged in, and understand how you use the site. Cookies can be session-based (deleted when you close your browser) or persistent (stored for a set period).",
        },
        {
          heading: "Types of Cookies We Use",
          body: "We use strictly necessary cookies (essential for the site to function), functional cookies (remember your preferences like language and cart contents), analytics cookies (help us understand traffic and behavior using privacy-respecting tools), and marketing cookies (only with your explicit consent).",
        },
        {
          heading: "Managing Your Cookie Preferences",
          body: "You can manage or withdraw your consent at any time using the cookie settings panel accessible from the footer of any page. You may also configure your browser to block or delete cookies, though this may affect your experience on our site.",
        },
      ],
    },
    "fr-FR": {
      title: "Politique des Cookies",
      lead: "Cette Politique des Cookies explique comment Fufuni utilise les cookies et les technologies de suivi similaires sur notre site web. Dernière mise à jour : 1er janvier 2026.",
      sections: [
        {
          heading: "Qu'est-ce qu'un cookie ?",
          body: "Les cookies sont de petits fichiers texte placés sur votre appareil lorsque vous visitez un site web. Ils aident le site à mémoriser vos préférences, à vous maintenir connecté et à comprendre comment vous utilisez le site.",
        },
        {
          heading: "Types de cookies que nous utilisons",
          body: "Nous utilisons des cookies strictement nécessaires (essentiels au fonctionnement du site), des cookies fonctionnels (mémorisent vos préférences tels que la langue et le contenu du panier), des cookies analytiques et des cookies marketing (uniquement avec votre consentement explicite).",
        },
        {
          heading: "Gérer vos préférences",
          body: "Vous pouvez gérer ou retirer votre consentement à tout moment en utilisant le panneau de paramètres des cookies accessible depuis le pied de page. Vous pouvez également configurer votre navigateur pour bloquer ou supprimer les cookies.",
        },
      ],
    },
    "es-ES": {
      title: "Política de Cookies",
      lead: "Esta Política de Cookies explica cómo Fufuni usa cookies y tecnologías de seguimiento similares en nuestro sitio web. Última actualización: 1 de enero de 2026.",
      sections: [
        {
          heading: "¿Qué son las cookies?",
          body: "Las cookies son pequeños archivos de texto que se colocan en tu dispositivo cuando visitas un sitio web. Ayudan al sitio a recordar tus preferencias, mantenerte conectado y entender cómo usas el sitio.",
        },
        {
          heading: "Tipos de cookies que usamos",
          body: "Usamos cookies estrictamente necesarias (esenciales para el funcionamiento del sitio), cookies funcionales (recuerdan tus preferencias), cookies analíticas y cookies de marketing (solo con tu consentimiento explícito).",
        },
        {
          heading: "Gestionar tus preferencias",
          body: "Puedes gestionar o retirar tu consentimiento en cualquier momento usando el panel de configuración de cookies accesible desde el pie de página. También puedes configurar tu navegador para bloquear o eliminar cookies.",
        },
      ],
    },
    "ar-SA": {
      title: "سياسة ملفات تعريف الارتباط",
      lead: "توضح سياسة ملفات تعريف الارتباط هذه كيفية استخدام فوفوني لملفات تعريف الارتباط وتقنيات التتبع المماثلة على موقعنا الإلكتروني. آخر تحديث: 1 يناير 2026.",
      sections: [
        {
          heading: "ما هي ملفات تعريف الارتباط؟",
          body: "ملفات تعريف الارتباط هي ملفات نصية صغيرة توضع على جهازك عند زيارة موقع ويب. تساعد الموقع على تذكر تفضيلاتك والحفاظ على تسجيل دخولك وفهم كيفية استخدامك للموقع.",
        },
        {
          heading: "أنواع ملفات تعريف الارتباط التي نستخدمها",
          body: "نستخدم ملفات تعريف الارتباط الضرورية تماماً (أساسية لعمل الموقع) والملفات الوظيفية (تتذكر تفضيلاتك) وملفات التحليلات وملفات التسويق (فقط بموافقتك الصريحة).",
        },
        {
          heading: "إدارة تفضيلاتك",
          body: "يمكنك إدارة موافقتك أو سحبها في أي وقت باستخدام لوحة إعدادات ملفات تعريف الارتباط التي يمكن الوصول إليها من تذييل أي صفحة. يمكنك أيضاً تكوين متصفحك لحظر ملفات تعريف الارتباط أو حذفها.",
        },
      ],
    },
    "zh-CN": {
      title: "Cookie 政策",
      lead: "本 Cookie 政策解释了 Fufuni 如何在我们的网站上使用 Cookie 和类似的跟踪技术。最后更新：2026年1月1日。",
      sections: [
        {
          heading: "什么是 Cookie？",
          body: "Cookie 是访问网站时放置在您设备上的小文本文件。它们帮助网站记住您的偏好、保持您的登录状态并了解您如何使用该网站。",
        },
        {
          heading: "我们使用的 Cookie 类型",
          body: "我们使用严格必要的 Cookie（网站运行所必需）、功能性 Cookie（记住您的语言和购物车内容等偏好）、分析性 Cookie，以及营销 Cookie（仅在您明确同意的情况下）。",
        },
        {
          heading: "管理您的 Cookie 偏好",
          body: "您可以随时使用任何页面页脚中的 Cookie 设置面板管理或撤回您的同意。您也可以配置浏览器来阻止或删除 Cookie，但这可能会影响您在我们网站上的体验。",
        },
      ],
    },
    "he-IL": {
      title: "מדיניות עוגיות",
      lead: "מדיניות עוגיות זו מסבירה כיצד Fufuni משתמשת בעוגיות ובטכנולוגיות מעקב דומות באתר שלנו. עדכון אחרון: 1 בינואר 2026.",
      sections: [
        {
          heading: "מהן עוגיות?",
          body: "עוגיות הן קבצי טקסט קטנים המוצבים במכשיר שלכם כאשר אתם מבקרים באתר. הן עוזרות לאתר לזכור את ההעדפות שלכם, לשמור על כניסתכם ולהבין כיצד אתם משתמשים באתר.",
        },
        {
          heading: "סוגי העוגיות שאנחנו משתמשים",
          body: "אנחנו משתמשים בעוגיות הכרחיות לחלוטין (חיוניות לתפקוד האתר), עוגיות פונקציונליות (זוכרות את ההעדפות שלכם כמו שפה ותוכן עגלה), עוגיות ניתוח ועוגיות שיווקיות (רק בהסכמתכם המפורשת).",
        },
        {
          heading: "ניהול העדפות העוגיות שלכם",
          body: "תוכלו לנהל או לבטל את הסכמתכם בכל עת באמצעות לוח הגדרות עוגיות הנגיש מהכותרת התחתונה של כל דף. תוכלו גם להגדיר את הדפדפן שלכם לחסום או למחוק עוגיות.",
        },
      ],
    },
  },

  // ─────────────────────────── LEGAL MENTIONS ─────────────────────────────
  "legal-mentions": {
    "en-US": {
      title: "Legal Mentions",
      lead: "The following legal information applies to the Fufuni platform and its associated website. Last updated: January 1, 2026.",
      sections: [
        {
          heading: "Publisher Information",
          body: "Fufuni is operated by SCTG Development, a company registered under applicable law. Registered address: available upon request. VAT registration number: available upon request. For any legal queries, contact: legal@fufuni.io.",
        },
        {
          heading: "Hosting",
          body: "This website and its associated services are hosted on Cloudflare's global network. Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA. The platform leverages Cloudflare Workers and Durable Objects for a globally distributed, edge-native architecture.",
        },
        {
          heading: "Intellectual Property",
          body: "The Fufuni platform source code is published under the AGPL-3.0 license and is available at github.com/sctg-development/fufuni. All trademarks, logos, and brand assets remain the property of SCTG Development. Unauthorized reproduction of these assets is prohibited.",
        },
      ],
    },
    "fr-FR": {
      title: "Mentions Légales",
      lead: "Les informations légales suivantes s'appliquent à la plateforme Fufuni et à son site web associé. Dernière mise à jour : 1er janvier 2026.",
      sections: [
        {
          heading: "Informations sur l'éditeur",
          body: "Fufuni est exploitée par SCTG Development, société enregistrée conformément aux lois applicables. Adresse du siège social : disponible sur demande. Numéro de TVA intracommunautaire : disponible sur demande. Pour toute question juridique : legal@fufuni.io.",
        },
        {
          heading: "Hébergement",
          body: "Ce site web et ses services associés sont hébergés sur le réseau mondial de Cloudflare. Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis. La plateforme utilise Cloudflare Workers et Durable Objects.",
        },
        {
          heading: "Propriété intellectuelle",
          body: "Le code source de la plateforme Fufuni est publié sous licence AGPL-3.0 et disponible sur github.com/sctg-development/fufuni. Toutes les marques, logos et ressources de marque restent la propriété de SCTG Development. Leur reproduction non autorisée est interdite.",
        },
      ],
    },
    "es-ES": {
      title: "Aviso Legal",
      lead: "La siguiente información legal se aplica a la plataforma Fufuni y a su sitio web asociado. Última actualización: 1 de enero de 2026.",
      sections: [
        {
          heading: "Información del editor",
          body: "Fufuni es operada por SCTG Development, empresa registrada bajo la legislación aplicable. Dirección registrada: disponible bajo solicitud. Para consultas legales: legal@fufuni.io.",
        },
        {
          heading: "Alojamiento",
          body: "Este sitio web y sus servicios asociados están alojados en la red global de Cloudflare. Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, EE.UU. La plataforma utiliza Cloudflare Workers y Durable Objects.",
        },
        {
          heading: "Propiedad intelectual",
          body: "El código fuente de Fufuni se publica bajo la licencia AGPL-3.0 y está disponible en github.com/sctg-development/fufuni. Todas las marcas, logotipos y activos de marca siguen siendo propiedad de SCTG Development.",
        },
      ],
    },
    "ar-SA": {
      title: "البيانات القانونية",
      lead: "تنطبق المعلومات القانونية التالية على منصة فوفوني وموقعها الإلكتروني المرتبط. آخر تحديث: 1 يناير 2026.",
      sections: [
        {
          heading: "معلومات الناشر",
          body: "تُشغَّل فوفوني من قِبل SCTG Development، شركة مسجلة وفق القوانين المعمول بها. العنوان المسجل: متاح عند الطلب. رقم ضريبة القيمة المضافة: متاح عند الطلب. للاستفسارات القانونية: legal@fufuni.io.",
        },
        {
          heading: "الاستضافة",
          body: "يُستضاف هذا الموقع الإلكتروني وخدماته المرتبطة على الشبكة العالمية لكلاودفلير. Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA. تستخدم المنصة Cloudflare Workers وDurable Objects.",
        },
        {
          heading: "الملكية الفكرية",
          body: "تم نشر كود المصدر لمنصة فوفوني بموجب ترخيص AGPL-3.0 وهو متاح على github.com/sctg-development/fufuni. جميع العلامات التجارية والشعارات وأصول العلامة التجارية تبقى ملكاً لـ SCTG Development.",
        },
      ],
    },
    "zh-CN": {
      title: "法律声明",
      lead: "以下法律信息适用于 Fufuni 平台及其相关网站。最后更新：2026年1月1日。",
      sections: [
        {
          heading: "发布者信息",
          body: "Fufuni 由 SCTG Development 运营，该公司依据适用法律注册。注册地址：可根据请求提供。增值税注册号：可根据请求提供。法律咨询请联系：legal@fufuni.io。",
        },
        {
          heading: "托管",
          body: "本网站及其相关服务托管在 Cloudflare 的全球网络上。Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA。该平台利用 Cloudflare Workers 和 Durable Objects 实现全球分布式边缘原生架构。",
        },
        {
          heading: "知识产权",
          body: "Fufuni 平台源代码根据 AGPL-3.0 许可证发布，可在 github.com/sctg-development/fufuni 获取。所有商标、标志和品牌资产仍属于 SCTG Development 所有。未经授权复制这些资产是被禁止的。",
        },
      ],
    },
    "he-IL": {
      title: "הצהרות משפטיות",
      lead: "המידע המשפטי הבא חל על פלטפורמת Fufuni ואתר האינטרנט המשויך לה. עדכון אחרון: 1 בינואר 2026.",
      sections: [
        {
          heading: "מידע על המפרסם",
          body: "Fufuni מנוהלת על ידי SCTG Development, חברה הרשומה לפי החוק החל. כתובת רשומה: זמינה על פי בקשה. מספר מע\"מ: זמין על פי בקשה. לשאלות משפטיות: legal@fufuni.io.",
        },
        {
          heading: "אחסון",
          body: "אתר אינטרנט זה ושירותיו המשויכים מתארחים ברשת הגלובלית של Cloudflare. Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA. הפלטפורמה משתמשת ב-Cloudflare Workers ו-Durable Objects.",
        },
        {
          heading: "קניין רוחני",
          body: "קוד המקור של פלטפורמת Fufuni מפורסם תחת רישיון AGPL-3.0 וזמין בכתובת github.com/sctg-development/fufuni. כל הסימנים המסחריים, הלוגואים ונכסי המותג נשארים רכושה של SCTG Development.",
        },
      ],
    },
  },
};

/**
 * Returns the page content for a given handle and locale,
 * falling back to en-US if the locale is not found.
 */
export function getCmsPage(
  handle: string,
  locale: string,
): CmsPageContent | null {
  const page = CMS_CONTENT[handle];
  if (!page) return null;

  // Try exact match, then language code only (e.g. "fr" from "fr-FR"), then en-US
  return (
    page[locale] ??
    page[Object.keys(page).find((k) => k.startsWith(locale.split("-")[0])) ?? ""] ??
    page["en-US"] ??
    null
  );
}
