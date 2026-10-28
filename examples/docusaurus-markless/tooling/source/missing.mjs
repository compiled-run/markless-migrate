// Stands in for an import with no port yet, so the importer can list every missing port in one run.
const name = new URL(import.meta.url).searchParams.get('name');
function Missing() {
	throw new Error(`no port for ${name}`);
}
export default Missing;
