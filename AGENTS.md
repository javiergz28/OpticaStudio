# Óptica Studio Pro — Reglas de trabajo

Aplicable a ChatGPT, Google AI Studio y cualquier agente o desarrollador.
Leer PROJECT-MASTER.md antes de trabajar. Si hay divergencia, detener la sincronización y reconciliar los cambios sin sobrescribir trabajo pendiente.

## Repositorio y entorno único
- Fuente de verdad: javiergz28/OpticaStudio, rama dev. En la Mac utilizar únicamente ~/Documents/GitHub/OpticaStudio-DEV-SHARED como entorno de desarrollo. Conservar main como referencia estable.
- Un editor activo por checkpoint. Verificar git status y HEAD remoto, recuperar cambios y revisar diferencias antes de editar. No usar force-push ni modificar main, publicar releases o fusionar sin autorización expresa.
- Versionar código, pruebas y documentación en Git. No crear copias completas del proyecto por checkpoint ni exportar ZIP/parches rutinariamente.
- Mantener una sola instalación de Óptica Studio en /Applications. No modificar el perfil activo ni grabaciones ni galería durante instalaciones o limpieza.

## Respaldo y limpieza obligatoria
- Mantener un solo respaldo anterior del perfil en ~/Library/Application Support/OpticaStudio-Backups/Perfil-anterior. No generar respaldos acumulativos en Documentos ni subir perfiles a GitHub.
- Antes de sustituir una instalación, comprobar que no hay grabación activa; crear respaldo temporal, verificarlo y conservar el anterior hasta validar el arranque. Rotar el respaldo al finalizar, de forma reversible.
- Mantener como máximo una versión anterior de la aplicación para rollback; retirar duplicados obsoletos una vez comprobada la versión estable. No vaciar la Papelera sin autorización.
- Reutilizar node_modules del DEV activo. Al cerrar cada checkpoint retirar compilaciones temporales, dependencias duplicadas, exportaciones y logs redundantes; preservar pruebas, evidencia útil y código no versionado hasta consolidarlo. No borrar archivos personales ni fuentes sin verificar su recuperación.
- Registrar en PROJECT-MASTER.md archivos retirados, verificaciones, limitaciones, commit y siguiente checkpoint. No afirmar espacio físico recuperado a partir de tamaños aparentes APFS.

## Protección y aceptación
- Conservar CP-P02-C3-R3 aprobado, pruebas existentes, diseño, permisos y recursos protegidos. Revisar cambios automáticos de AI Studio (lockfile, iconos, modo ejecutable del lanzador) antes de aceptar commits.
- No instalar ni declarar aprobado código parcial. Ejecutar pruebas y comprobaciones locales; distinguir resultados técnicos de validación física del usuario.
