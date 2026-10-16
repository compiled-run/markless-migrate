Rails.application.routes.draw do
  devise_for :users
  root 'pages#home'
  get 'about', to: 'pages#about'
  resources :posts, only: [:index, :show, :create] do
    member do
      post :publish
    end
    resources :comments, only: [:create]
  end
  namespace :admin do
    resources :reports, only: [:index]
  end
  authenticate :user, ->(u) { u.admin? } do
    get 'ops', to: 'ops#index'
  end
  scope '(:locale)' do
    get 'pricing', to: 'pages#pricing'
  end
end
