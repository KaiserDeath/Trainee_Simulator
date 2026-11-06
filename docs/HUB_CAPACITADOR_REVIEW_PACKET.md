# Capacitador release review packet / Revisión de publicación

Prepared 2026-11-06. Status: pending actual review and supervised use.
Preparado el 06/11/2026. Estado: pendiente de revisión y uso supervisado reales.

The position is configurable in config/hub-release-acceptance.json. Its initial
label is Capacitador and its required application role is TRAINER. A position
label does not grant permissions. Assign the real username and cohort/roster
before recording acceptance. The roster can contain new learners and employees
receiving reinforcement; ten is the initial concurrency target, not a total-user cap.

El puesto se configura en config/hub-release-acceptance.json. El nombre inicial
es Capacitador y requiere el rol TRAINER. El nombre del puesto no concede permisos.
Asigne el usuario real y el grupo/lista antes de registrar la aceptación. Pueden
participar alumnos nuevos y empleados en refuerzo; diez es el objetivo inicial de
concurrencia, no un límite total de alumnos.

## Curriculum and evaluations / Contenido y evaluaciones

Review all 15 modules using docs/TRAINING_HUB_CURRICULUM_TRACEABILITY_2026-11-02.md.
Check meaning and terminology in both languages, prerequisite explanations,
confidentiality, exception handling and escalation. Inspect the four draft
policy versions in the authenticated editor and record their exact digests,
reviewer and date. Technical tests do not approve the curriculum. Use the governed
policy publication workflow after the real decision.

Revise los 15 módulos con la matriz de trazabilidad indicada. Compruebe el sentido
y los términos en ambos idiomas, los requisitos previos, la confidencialidad, las
excepciones y el escalamiento. Revise las cuatro versiones de política en borrador
en el editor autenticado y registre sus resúmenes exactos, revisor y fecha. Las
pruebas técnicas no aprueban el contenido. Publique mediante el flujo de revisión
después de la decisión real.

For new lesson versions, publish the independently reviewed Spanish companion
before its exact English source. For private questions, review English/Spanish
stems and each choice together, retaining the same IDs and canonical correct choice.
Existing attempt snapshots and official results must remain intact.

Para nuevas lecciones, publique primero la traducción al español revisada por otra
persona y luego su versión exacta en inglés. Para preguntas privadas, revise ambos
idiomas y cada alternativa conservando sus identificadores y respuesta correcta
canónica. Los intentos históricos y resultados oficiales deben conservarse.

## Hosted journey and pilot / Recorrido publicado y piloto

After approval, use designated real test accounts and verify enrollment, resume,
prerequisites, theory and native practical tasks, timers, retries, submission,
trainer evidence review and readiness. Check language switching preserves answers.
Then supervise representative onboarding and reinforcement tasks on desktop/mobile,
keyboard and zoom. Record confusion, lost work, errors, help required and defects.
Resolve critical findings before expanding concurrent use.

Tras la aprobación, use cuentas designadas y verifique inscripción, reanudación,
requisitos previos, teoría, práctica nativa, temporizadores, reintentos, envío,
revisión de evidencias y preparación. Compruebe que cambiar el idioma conserva las
respuestas. Supervise tareas de incorporación y refuerzo en escritorio/móvil, con
teclado y zoom. Registre confusiones, pérdida de trabajo, errores, ayuda y defectos.
Resuelva los problemas críticos antes de aumentar el uso simultáneo.

Record dated human evidence references in the acceptance configuration after the
work occurs. Keep passwords, private questions/answers and identifiable learner
records out of committed reports. Run npm run verify:release:acceptance to identify
remaining fields. A pending check is intentional until these actions occur.

Registre las referencias de evidencia humana con fecha después de realizar el
trabajo. No incluya contraseñas, preguntas/respuestas privadas ni datos personales
en informes del repositorio. Ejecute npm run verify:release:acceptance para listar
los campos pendientes. El estado pendiente es intencional hasta realizar estas acciones.

User assignment, 2026-11-06: Edwin Galvez, Hub username Egalvez, is the
Capacitador responsible for curriculum review and pilot supervision. The hosted
account was verified active with the existing TRAINER role. The pilot cohort/roster
will be chosen later. Assignment does not record curriculum approval or pilot completion.
