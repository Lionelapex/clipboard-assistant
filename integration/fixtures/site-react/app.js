(function () {
  const e = React.createElement;
  const { useState } = React;

  function App() {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [extras, setExtras] = useState([]);

    return e(
      'div',
      { className: 'card' },
      e('h2', null, 'New support request'),
      e('label', { htmlFor: 'react-subject' }, 'Subject'),
      e('input', {
        id: 'react-subject',
        type: 'text',
        value: subject,
        placeholder: 'Short summary',
        onChange: (event) => setSubject(event.target.value),
      }),
      e('label', { htmlFor: 'react-body' }, 'Description'),
      e('textarea', {
        id: 'react-body',
        rows: 6,
        value: body,
        placeholder: 'Describe the issue',
        onChange: (event) => setBody(event.target.value),
      }),
      e(
        'p',
        { className: 'count', 'data-testid': 'react-count' },
        `${subject.length + body.length} characters in React state`,
      ),
      e(
        'button',
        {
          type: 'button',
          onClick: () => setExtras((current) => [...current, current.length + 1]),
        },
        'Add field',
      ),
      extras.map((number) =>
        e(
          'div',
          { key: number },
          e('label', { htmlFor: `react-extra-${number}` }, `Extra note ${number}`),
          e('textarea', {
            id: `react-extra-${number}`,
            rows: 3,
            'data-testid': `react-extra-${number}`,
          }),
        ),
      ),
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(e(App));
})();
