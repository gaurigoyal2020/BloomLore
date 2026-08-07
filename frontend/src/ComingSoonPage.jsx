import Mascot from './Mascot';

/**
 * Used by Dashboard/Subtitles/My Plan/Settings for now — real routes,
 * real nav links, but honest about not being built yet rather than a
 * dead link or, worse, fake content pretending to be functional.
 */
const ComingSoonPage = ({ title, description }) => (
  <div className="settings-panel" style={{ maxWidth: 480, margin: '4rem auto 0' }}>
    <div className="settings-card" style={{ textAlign: 'center' }}>
      <Mascot size={48} state="idle" />
      <h2 className="settings-title" style={{ marginTop: '1rem' }}>{title}</h2>
      <p className="field-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
        {description}
      </p>
    </div>
  </div>
);

export default ComingSoonPage;