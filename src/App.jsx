import { useState, useCallback, useRef, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Schedule from './pages/Schedule';
import MyMatches from './pages/MyMatches';
import Teams from './pages/Teams';
import Missing from './pages/Missing';
import Bets from './pages/Bets';
import Rules from './pages/Rules';
import TeamProfile from './pages/TeamProfile';
import HamburgerMenu from './components/HamburgerMenu';
import PoolSelector from './components/PoolSelector';
import PoolManager from './components/PoolManager';
import AuthScreen from './components/AuthScreen';
import LanguageSwitcher from './components/LanguageSwitcher';
import InstallBanner from './components/InstallBanner';
import { useFavorites } from './hooks/useFavorites';
import { useAuth } from './hooks/useAuth';
import Admin from './pages/Admin';
import logo from './assets/logo.png';
import headerBanner from './assets/header-banner.jpg';
import splashNoComplaints from './assets/splash-intro.jpg';
import splashForbiddenNe from './assets/splash-proibido-ne.jpg';
import './App.css';

const ADMIN_UID = import.meta.env.VITE_ADMIN_UID;
const SPLASH_DURATION_MS = 6000;
const SPLASH_INTROS = [
  {
    src: splashNoComplaints,
    alt: 'Não vou reclamar durante a Copa',
  },
  {
    src: splashForbiddenNe,
    alt: 'Sabe que é proibido, né',
  },
];

export default function App() {
  const [page, setPage] = useState('schedule');
  const [animClass, setAnimClass] = useState('page-enter-done');
  const [teamIso, setTeamIso] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [splashIntro] = useState(() =>
    SPLASH_INTROS[Math.floor(Math.random() * SPLASH_INTROS.length)]
  );
  const prevPageRef = useRef('schedule');
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { user, profile, loading, isAnonymous } = useAuth();
  const isAdmin = user?.uid && user.uid === ADMIN_UID;

  const navigate = useCallback((newPage) => {
    if (newPage === page) return;
    // Silent redirect for non-admin trying to access admin
    if (newPage === 'admin' && !isAdmin) {
      return;
    }
    setAnimClass('page-exit');
    setTimeout(() => {
      setPage(newPage);
      setAnimClass('page-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('page-enter-done');
        });
      });
    }, 150);
  }, [page, isAdmin]);

  const navigateToTeam = useCallback((iso) => {
    prevPageRef.current = page;
    setTeamIso(iso);
    setAnimClass('page-exit');
    setTimeout(() => {
      setPage('team');
      setAnimClass('page-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('page-enter-done');
        });
      });
    }, 150);
  }, [page]);

  const navigateBackFromTeam = useCallback(() => {
    navigate(prevPageRef.current);
  }, [navigate]);

  // Handle #admin hash navigation
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#admin' && isAdmin) {
        setPage('admin');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [isAdmin]);

  useEffect(() => {
    if (loading) return undefined;
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">
          <img src={logo} alt="Copa 2026" className="app-header__logo" />
          <span className="app-loading__text">⚽</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {showSplash && (
        <div className="splash-intro" aria-label="Abertura Copa-Yantai">
          <div className="splash-intro__glow" />
          <img
            src={splashIntro.src}
            alt={splashIntro.alt}
            className="splash-intro__image"
          />
        </div>
      )}

      <header className="app-header">
        <div className="app-header__content">
          {profile?.nickname && <HamburgerMenu onNavigate={navigate} />}
          <img src={headerBanner} alt="Copa do Mundo 2026 PBCN" className="app-header__banner" />
          <LanguageSwitcher />
        </div>
        {profile?.nickname && (
          <PoolSelector onManagePools={() => navigate('pools')} />
        )}
      </header>

      {isAnonymous || !profile || !profile.nickname ? (
        <AuthScreen />
      ) : (
        <>
          <main className="app-main">
            <div className={`page-wrapper ${animClass}`}>
              {page === 'schedule' && <Schedule onTeamClick={navigateToTeam} />}
              {page === 'my-matches' && (
                <MyMatches favorites={favorites} onNavigate={navigate} onTeamClick={navigateToTeam} />
              )}
              {page === 'teams' && (
                <Teams
                  favorites={favorites}
                  toggleFavorite={toggleFavorite}
                  isFavorite={isFavorite}
                  onTeamClick={navigateToTeam}
                />
              )}
              {page === 'bets' && <Bets onTeamClick={navigateToTeam} />}
              {page === 'team' && (
                <TeamProfile
                  iso={teamIso}
                  onBack={navigateBackFromTeam}
                  onTeamClick={navigateToTeam}
                />
              )}
              {page === 'pools' && <PoolManager />}
              {page === 'rules' && <Rules />}
              {page === 'missing' && <Missing />}
              {page === 'admin' && isAdmin && <Admin />}
            </div>
          </main>

          <InstallBanner />

          <BottomNav
            active={page === 'team' ? prevPageRef.current : page}
            onNavigate={navigate}
            favoriteCount={favorites.length}
          />
        </>
      )}
    </div>
  );
}
