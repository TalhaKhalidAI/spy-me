import React from 'react'

const Table = ({ data = [], columns = [] }) => {
  if (!data.length) {
    return <div>No data to display</div>
  }

  // If no columns passed, infer keys from first item
  const headers = columns.length
    ? columns
    : Object.keys(data[0]).map((key) => ({ key, label: key }))

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            {headers.map(({ key, label }) => (
              <th key={key}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-base-200' : ''}>
              <th>{i + 1}</th>
              {headers.map(({ key }) => (
                <td key={key}>{row[key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Table
