import React, { useState, useMemo, useCallback } from 'react';

// #region types
interface TableColumn {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  sortable?: boolean;
  searchable?: boolean;
}

interface TableAction<T = any> {
  label?: string;
  icon?: React.ReactNode;
  onClick: (row: T, index: number) => void;
  title?: string;
  variant?: 'info' | 'warning' | 'error' | 'success' | 'primary' | 'ghost' | 'default';
  size?: 'xs' | 'sm' | 'md';
  showOnHover?: boolean;
  disabled?: (row: T) => boolean;
  render?: (row: T, index: number) => React.ReactNode;
}

interface TableProps<T = any> {
  columns: TableColumn[];
  data: T[];
  rowKey?: string;
  zebra?: boolean;
  hover?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showRowNumbers?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T, index: number) => void;
  className?: string;
  isLoading?: boolean;
  actions?: TableAction<T>[];
  actionRenderer?: (row: T, index: number) => React.ReactNode;
  itemsPerPage?: number;
  showPagination?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  showCheckbox?: boolean;
  selectedRows?: T[];
  onRowSelect?: (row: T, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
  checkboxDisabled?: (row: T) => boolean;
  selectable?: boolean;
  themeAware?: boolean;
  checkboxColor?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'ghost';
  // ✅ NEW: Custom header colors
  headerClassName?: string;
  headerTextClassName?: string;
  rowClassName?: string;
  cellClassName?: string;
}

// #endregion

// #region component
const Table = <T extends Record<string, any>>({
  columns,
  data,
  rowKey = 'id',
  zebra = true,
  hover = true,
  size = 'sm',
  showRowNumbers = false,
  emptyMessage = 'No data available',
  onRowClick,
  className = '',
  isLoading = false,
  actions,
  actionRenderer,
  itemsPerPage = 10,
  showPagination = true,
  showSearch = true,
  searchPlaceholder = 'Search...',
  defaultSortKey,
  defaultSortDirection = 'asc',
  showCheckbox = false,
  selectedRows = [],
  onRowSelect,
  onSelectAll,
  checkboxDisabled,
  selectable = true,
  themeAware = true,
  checkboxColor = 'primary',
  headerClassName = 'bg-base-200/70',
  headerTextClassName = 'text-base-content font-semibold',
  rowClassName = '',
  cellClassName = '',
}: TableProps<T>): JSX.Element => {
  // ─── State ──────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey || null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

  // ─── Detect Theme ──────────────────────────────────────────
  const [isDarkMode, setIsDarkMode] = useState(false);

  React.useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') ||
                     document.documentElement.getAttribute('data-theme')?.includes('dark') ||
                     window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(isDark);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', checkTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', checkTheme);
    };
  }, []);

  // ─── Search ─────────────────────────────────────────────────
  const searchableColumns = useMemo(
    () => columns.filter((col) => col.searchable !== false),
    [columns]
  );

  const filteredData = useMemo(() => {
    if (!searchTerm.trim() || searchableColumns.length === 0) {
      return data;
    }

    const term = searchTerm.toLowerCase().trim();
    return data.filter((row) => {
      return searchableColumns.some((col) => {
        const value = row[col.key];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm, searchableColumns]);

  // ─── Sorting ─────────────────────────────────────────────────
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDirection === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });

    return sorted;
  }, [filteredData, sortKey, sortDirection]);

  // ─── Pagination ─────────────────────────────────────────────
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const paginatedData = useMemo(() => {
    if (!showPagination) return sortedData;
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedData.slice(start, end);
  }, [sortedData, currentPage, itemsPerPage, showPagination]);

  // ─── Checkbox Helpers ──────────────────────────────────────
  const isRowSelected = (row: T) => {
    const id = row[rowKey];
    return selectedRows.some((r) => r[rowKey] === id);
  };

  const isAllSelected = useMemo(() => {
    if (paginatedData.length === 0) return false;
    return paginatedData.every((row) => {
      const id = row[rowKey];
      return selectedRows.some((r) => r[rowKey] === id);
    });
  }, [paginatedData, selectedRows, rowKey]);

  const isIndeterminate = useMemo(() => {
    const selectedCount = paginatedData.filter((row) => {
      const id = row[rowKey];
      return selectedRows.some((r) => r[rowKey] === id);
    }).length;
    return selectedCount > 0 && selectedCount < paginatedData.length;
  }, [paginatedData, selectedRows, rowKey]);

  // ─── Reset to first page when search/filter changes ──────
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortKey, sortDirection]);

  // ─── Handlers ──────────────────────────────────────────────
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleRowSelect = (row: T, checked: boolean) => {
    if (checkboxDisabled?.(row)) return;
    onRowSelect?.(row, checked);
  };

  const handleSelectAll = (checked: boolean) => {
    onSelectAll?.(checked);
  };

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // ─── Render Loading State ──────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  // ─── Render Empty State ────────────────────────────────────
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/50 text-sm bg-base-200/50 rounded-xl border-2 border-dashed border-base-300">
        <div className="text-4xl mb-2">📭</div>
        {emptyMessage}
      </div>
    );
  }

  // ─── Table Size Classes ──────────────────────────────────
  const sizeClass = {
    xs: 'table-xs',
    sm: 'table-sm',
    md: 'table-md',
    lg: 'table-lg',
  }[size] || 'table-sm';

  const zebraClass = zebra ? 'table-zebra' : '';
  const hoverClass = hover ? 'table-hover' : '';
  const hasActions = !!(actions?.length || actionRenderer);
  const hasCheckbox = showCheckbox && selectable;

  // ─── Theme-Aware Checkbox Component ──────────────────────
  const ThemeAwareCheckbox = ({
    checked,
    onChange,
    disabled = false,
    indeterminate = false,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    indeterminate?: boolean;
  }) => {
    const checkboxRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    const getCheckboxClass = () => {
      if (!themeAware) {
        return `checkbox checkbox-${checkboxColor} checkbox-sm`;
      }

      const baseClass = 'checkbox checkbox-sm';
      
      if (isDarkMode) {
        const darkColorMap: Record<string, string> = {
          primary: 'checkbox-primary',
          secondary: 'checkbox-secondary',
          accent: 'checkbox-accent',
          success: 'checkbox-success',
          warning: 'checkbox-warning',
          error: 'checkbox-error',
          ghost: 'checkbox-ghost',
        };
        return `${baseClass} ${darkColorMap[checkboxColor] || darkColorMap.primary}`;
      }

      return `${baseClass} checkbox-${checkboxColor}`;
    };

    return (
      <input
        ref={checkboxRef}
        type="checkbox"
        className={getCheckboxClass()}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  };

  // ─── Render Action Buttons ────────────────────────────────
  const renderActionButtons = (row: T, index: number) => {
    if (actionRenderer) {
      return actionRenderer(row, index);
    }

    if (!actions || actions.length === 0) {
      return null;
    }

    return (
      <div className="flex gap-1 justify-center flex-wrap">
        {actions.map((action, idx) => {
          if (action.render) {
            return <React.Fragment key={idx}>{action.render(row, index)}</React.Fragment>;
          }

          const isDisabled = action.disabled?.(row) || false;

          const variantStyles: Record<string, string> = {
            info: 'text-info hover:bg-info/20 hover:text-info',
            warning: 'text-warning hover:bg-warning/20 hover:text-warning',
            error: 'text-error hover:bg-error/20 hover:text-error',
            success: 'text-success hover:bg-success/20 hover:text-success',
            primary: 'text-primary hover:bg-primary/20 hover:text-primary',
            ghost: 'hover:bg-base-200',
            default: 'hover:bg-base-200',
          };

          const variantClass = variantStyles[action.variant || 'default'] || variantStyles.default;
          const sizeMap = { xs: 'btn-xs', sm: 'btn-sm', md: 'btn-md' };
          const btnSizeClass = sizeMap[action.size || 'xs'] || 'btn-xs';
          const hoverClass = action.showOnHover ? 'opacity-0 group-hover:opacity-100 transition-opacity' : '';

          return (
            <button
              key={idx}
              className={`btn btn-ghost ${btnSizeClass} ${variantClass} ${hoverClass}`}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(row, index);
              }}
              title={action.title || action.label}
              disabled={isDisabled}
            >
              {action.icon}
              {action.label && <span className="hidden sm:inline">{action.label}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  // ─── Render Pagination ─────────────────────────────────────
  const renderPagination = () => {
    if (!showPagination || totalPages <= 1) return null;

    const pages = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
        <div className="text-sm text-base-content/50">
          Showing {((currentPage - 1) * itemsPerPage) + 1} -{' '}
          {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
        </div>
        <div className="join">
          <button
            className="join-item btn btn-sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            «
          </button>

          {startPage > 1 && (
            <>
              <button className="join-item btn btn-sm" onClick={() => handlePageChange(1)}>
                1
              </button>
              {startPage > 2 && <span className="join-item btn btn-sm btn-disabled">…</span>}
            </>
          )}

          {pages.map((page) => (
            <button
              key={page}
              className={`join-item btn btn-sm ${page === currentPage ? 'btn-primary' : ''}`}
              onClick={() => handlePageChange(page)}
            >
              {page}
            </button>
          ))}

          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="join-item btn btn-sm btn-disabled">…</span>}
              <button className="join-item btn btn-sm" onClick={() => handlePageChange(totalPages)}>
                {totalPages}
              </button>
            </>
          )}

          <button
            className="join-item btn btn-sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            »
          </button>
        </div>
      </div>
    );
  };

  // ─── Get Row Classes ──────────────────────────────────────
  const getRowClasses = (row: T, isSelected: boolean) => {
    const classes = [];
    
    if (onRowClick) classes.push('cursor-pointer');
    classes.push('group transition-colors');
    classes.push('hover:bg-base-200/50');
    if (isSelected) classes.push('bg-primary/5');
    if (rowClassName) classes.push(rowClassName);
    
    return classes.join(' ');
  };

  // ─── Get Cell Classes ─────────────────────────────────────
  const getCellClasses = () => {
    const classes = [];
    if (cellClassName) classes.push(cellClassName);
    return classes.join(' ');
  };

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className={`space-y-4 ${className}`}>
      {/* ─── Theme Indicator ────────────────────────────────── */}
      {themeAware && (
        <div className="text-xs text-base-content/40 flex items-center gap-2">
          <span className="badge badge-ghost badge-xs">
            {isDarkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </span>
        </div>
      )}

      {/* ─── Search Bar ──────────────────────────────────────── */}
      {showSearch && searchableColumns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              className="input input-bordered w-full pl-10 bg-base-100 text-base-content"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40">
              🔍
            </span>
            {searchTerm && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
          </div>
          <div className="text-sm text-base-content/50 whitespace-nowrap">
            {totalItems} {totalItems === 1 ? 'result' : 'results'}
          </div>
        </div>
      )}

      {/* ─── Table ───────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-base-200 bg-base-100 shadow-sm">
        <table className={`table ${sizeClass} ${zebraClass} ${hoverClass}`}>
          <thead className={headerClassName}>
            <tr>
              {hasCheckbox && (
                <th className="text-center w-10">
                  <ThemeAwareCheckbox
                    checked={isAllSelected}
                    indeterminate={isIndeterminate}
                    onChange={handleSelectAll}
                  />
                </th>
              )}

              {showRowNumbers && (
                <th className={`text-center w-10 ${headerTextClassName}`}>#</th>
              )}

              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    ${col.sortable !== false ? 'cursor-pointer select-none' : ''}
                    ${headerTextClassName}
                  `}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      <span className="text-base-content/30 text-xs">
                        {getSortIcon(col.key)}
                      </span>
                    )}
                  </div>
                </th>
              ))}

              {hasActions && (
                <th className={`text-center w-24 ${headerTextClassName}`}>Actions</th>
              )}
            </tr>
          </thead>

          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={
                  columns.length +
                  (showRowNumbers ? 1 : 0) +
                  (hasActions ? 1 : 0) +
                  (hasCheckbox ? 1 : 0)
                }>
                  <div className="text-center py-8 text-base-content/40 text-sm">
                    No matching results found
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const rowId = row[rowKey] || index;
                const globalIndex = (currentPage - 1) * itemsPerPage + index;
                const isSelected = isRowSelected(row);
                const isDisabled = checkboxDisabled?.(row) || false;

                return (
                  <tr
                    key={rowId}
                    onClick={() => onRowClick?.(row, globalIndex)}
                    className={getRowClasses(row, isSelected)}
                  >
                    {hasCheckbox && (
                      <td className="text-center md:table-cell" data-label="Select" onClick={(e) => e.stopPropagation()}>
                        <ThemeAwareCheckbox
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={(checked) => handleRowSelect(row, checked)}
                        />
                      </td>
                    )}

                    {showRowNumbers && (
                      <td className={`text-center text-base-content/40 font-mono text-xs ${getCellClasses()}`} data-label="#">
                        {globalIndex + 1}
                      </td>
                    )}

                    {columns.map((col) => (
                      <td key={col.key} className={getCellClasses()} data-label={col.label}>
                        {col.render
                          ? col.render(row[col.key], row)
                          : row[col.key] ?? '-'}
                      </td>
                    ))}

                    {hasActions && (
                      <td className={`text-center ${getCellClasses()}`} data-label="Actions">
                        {renderActionButtons(row, globalIndex)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination ───────────────────────────────────────── */}
      {renderPagination()}
    </div>
  );
};
// #endregion

export default Table;