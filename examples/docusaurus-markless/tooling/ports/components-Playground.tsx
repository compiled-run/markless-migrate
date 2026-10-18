// website/src/components/Playground, with its imports pointed at the ported theme.
import type { ReactNode } from '../source/h.mjs';
import { clsx, Translate, Link, Heading } from '../theme/core.jsx';
import Image from '../theme/IdealImage.jsx';
import { requireFor } from '../source/mdx.mjs';
import { website } from '../source/site.mjs';
const require = requireFor(website + '/src/components/Playground/index.tsx');
const Playgrounds = [
  {
    name: '📦 CodeSandbox',
    image: require('@site/static/img/playgrounds/codesandbox.png'),
    url: 'https://docusaurus.new/codesandbox',
    urlTS: 'https://docusaurus.new/codesandbox-ts',
    description: (
      <Translate id="playground.codesandbox.description">
        CodeSandbox is an online code editor and development environment that
        allows developers to create, share and collaborate on web development
        projects in a browser-based environment
      </Translate>
    ),
  },
  {
    name: '⚡ StackBlitz 🆕',
    image: require('@site/static/img/playgrounds/stackblitz.png'),
    url: 'https://docusaurus.new/stackblitz',
    urlTS: 'https://docusaurus.new/stackblitz-ts',
    description: (
      <Translate
        id="playground.stackblitz.description"
        values={{
          webContainersLink: (
            <Link href="https://blog.stackblitz.com/posts/introducing-webcontainers/">
              WebContainers
            </Link>
          ),
        }}>
        {
          'StackBlitz uses a novel {webContainersLink} technology to run Docusaurus directly in your browser.'
        }
      </Translate>
    ),
  },
];
interface Props {
  name: string;
  image: string;
  url: string;
  urlTS: string;
  description: ReactNode;
}
function PlaygroundCard({name, image, url, urlTS, description}: Props) {
  return (
    <div className="col col--6 margin-bottom--lg">
      <div className={clsx('card')}>
        <div className={clsx('card__image')}>
          <Link to={url}>
            <Image img={image} alt={`${name}'s image`} />
          </Link>
        </div>
        <div className="card__body">
          <Heading as="h3">{name}</Heading>
          <p>{description}</p>
        </div>
        <div className="card__footer">
          <div style={{textAlign: 'center'}}>
            <b>
              <Translate id="playground.tryItButton">Try it now!</Translate>
            </b>
          </div>
          <div className="button-group button-group--block">
            <Link className="button button--secondary" to={url}>
              JavaScript
            </Link>
            <Link className="button button--secondary" to={urlTS}>
              TypeScript
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
export function PlaygroundCardsRow(): ReactNode {
  return (
    <div className="row">
      {Playgrounds.map((playground) => (
        <PlaygroundCard key={playground.name} {...playground} />
      ))}
    </div>
  );
}
