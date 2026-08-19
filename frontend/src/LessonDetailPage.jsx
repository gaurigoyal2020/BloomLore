import { useEffect, useState } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import ResultsPage from './ResultsPage';
import Mascot from './Mascot';
import { getLessonDetail } from './api';

function LessonDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useOutletContext();

  const [result, setResult] = useState(null); // null = still loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getLessonDetail(id, session.access_token)
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [id, session.access_token]);

  if (error) {
    return (
      <div className="alert-error" style={{ maxWidth: 420 }}>
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="app-loading" style={{ height: 'auto', paddingTop: '4rem' }}>
        <Mascot size={48} state="idle" />
      </div>
    );
  }

  return (
    <ResultsPage
      result={result}
      file={result.originalFilename ? { name: result.originalFilename } : undefined}
      targetLang={result.targetLang}
      session={session}
      // Breadcrumb in ResultsPage says "Activity" and calls onReset —
      // here that should navigate back to the history list, not clear
      // an upload form (there isn't one on this page).
      onReset={() => navigate('/activity')}
    />
  );
}

export default LessonDetailPage;