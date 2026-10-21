import { Shell } from '../../components/layout/shell.tsrx';
import { ComingSoon } from '../../components/errors/errors.tsrx';

export default function HelpCenter() @{
	<Shell active="/help-center" header="none">
		<ComingSoon />
	</Shell>
}
