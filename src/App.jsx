import './App.css';

const bannerUrl = `${import.meta.env.BASE_URL}banner-campeoes.jpg`;

export default function App() {
  return (
    <main className="final-page">
      <img
        className="final-page__banner"
        src={bannerUrl}
        alt="Campeões do Bolão da Copa do Mundo 2026: Raphael Piazzarollo em primeiro lugar, Maurieli Deepseek em segundo, e Yasmeen e Paulo Giusti empatados em terceiro."
      />
    </main>
  );
}
