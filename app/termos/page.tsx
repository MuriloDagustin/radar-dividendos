import Link from 'next/link';
import { pageMetadata } from '@/app/seo';
import screen from '@/app/components/screen.module.css';
import styles from './termos.module.css';

export const metadata = pageMetadata('/termos');

export default function Page() {
  return (
    <div className={screen.view}>
      <header className={screen.head}>
        <h1 className={screen.title}>Escopo e termos de uso</h1>
        <p className={screen.lede}>
          Um projeto pessoal, sem fins comerciais, para consultar números publicados sobre ações e FIIs.
        </p>
      </header>

      <div className={styles.prose}>
        <section>
          <h2>O que este site faz</h2>
          <ul>
            <li>Mostra valores publicados por terceiros, com a fonte e a data de cada número.</li>
            <li>Filtra e ordena esses valores pelos limites e critérios que você escolhe. Sem limites, a lista é alfabética.</li>
            <li>Faz contas com as premissas que você informa, como quantas cotas cabem num valor e o efeito de reinvestir um dividend yield passado.</li>
            <li>Guarda favoritos, posições e anotações apenas no seu navegador.</li>
          </ul>
        </section>

        <section>
          <h2>O que este site não faz</h2>
          <ul>
            <li>Não recomenda comprar, vender ou manter nenhum ativo.</li>
            <li>Não atribui nota, classificação, ranking de qualidade ou veredito a ativos.</li>
            <li>Não avalia se um investimento é adequado ao seu perfil, objetivo ou situação financeira.</li>
            <li>Não monta nem sugere carteiras; a divisão da simulação é sempre uma escolha sua.</li>
            <li>Não prevê preços, dividendos ou rentabilidade.</li>
          </ul>
          <p>
            O conteúdo não é relatório de análise, consultoria ou recomendação de investimento. O autor não é
            analista, consultor ou assessor de investimentos registrado na CVM.
          </p>
        </section>

        <section>
          <h2>Sobre os dados</h2>
          <p>
            Os números vêm de fontes de terceiros e podem estar atrasados, incompletos ou errados. Campos
            ausentes aparecem como “—” e não são estimados. A cobertura se limita a FIIs com patrimônio acima de
            R$ 1 bilhão e a ações com liquidez acima de R$ 5 milhões por dia; esse recorte é técnico e não indica
            preferência por nenhum ativo. Confira sempre na fonte original e nos documentos oficiais do emissor
            antes de qualquer decisão.
          </p>
        </section>

        <section>
          <h2>Responsabilidade</h2>
          <p>
            Decisões de investimento são exclusivamente suas. Rentabilidade passada não garante rentabilidade
            futura. Se precisar de orientação, procure um profissional registrado na CVM; a lista de registrados
            está no <a href="https://www.gov.br/cvm/pt-br">site da CVM</a>.
          </p>
        </section>

        <p className={styles.back}>
          <Link href="/">voltar ao início</Link>
        </p>
      </div>
    </div>
  );
}
