" ========== Syntax and filetypes ==========
syntax on
filetype plugin indent on

" ========== Indentation ==========
set expandtab
set shiftwidth=4
set softtabstop=-1

" ========== Display and search ==========
set number
set relativenumber
set cursorline
set scrolloff=5
set incsearch
set hlsearch
set ignorecase
set smartcase

" ========== Status and command display ==========
set laststatus=2
set ruler
set showcmd

" ========== Long line display ==========
set wrap
set linebreak
set breakindent

" ========== Command-line completion ==========
set wildmenu

" ========== Key-code timeout ==========
set ttimeout
set ttimeoutlen=100

" ========== Mouse ==========
set mouse=a

" ========== Clipboard ==========
set clipboard=unnamedplus

" ========== Persistent undo ==========
if has('persistent_undo')
    set undodir=~/.vim/undo
    if !isdirectory(expand(&undodir))
        call mkdir(expand(&undodir), 'p', 0700)
    endif
    set undofile
endif

" ========== Restore cursor position ==========
augroup vimRestoreCursor
    autocmd!
    " Skip stale marks and buffers with session-specific content or layouts.
    autocmd BufReadPost *
        \ if line("'\"") >= 1 && line("'\"") <= line("$")
        \     && &filetype !~# 'commit'
        \     && index(['xxd', 'gitrebase', 'tutor'], &filetype) == -1
        \     && !&diff
        \ | execute "normal! g`\""
        \ | endif
augroup END

" ========== Insert mode ==========
inoremap jk <Esc>

" ========== Normal mode editing ==========
nnoremap K i<CR><Esc>

" ========== Text formatting ==========
nnoremap Q gq
xnoremap Q gq

" ========== Movement ==========
nnoremap H ^
nnoremap L $
nnoremap q b

vnoremap H ^
vnoremap L $
vnoremap q b

onoremap H ^
onoremap L $
onoremap q b

" ========== Scrolling ==========
nnoremap <C-j> <C-d>
nnoremap <C-k> <C-u>

vnoremap <C-j> <C-d>
vnoremap <C-k> <C-u>

" ========== Leader shortcuts ==========
let mapleader=" "
nnoremap <leader>o <C-o>
nnoremap <leader>n :nohlsearch<CR>

" ========== Tabs ==========
nnoremap th gT
nnoremap tl gt
nnoremap tc :tabclose<CR>

" ========== Keyword help ==========
nnoremap gh K
