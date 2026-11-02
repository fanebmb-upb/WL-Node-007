//Libraries
#include <iostream>
#include <vector>
#include <string>
#include <cmath>
#include <algorithm>
using namespace std;

//Constants
const double pi=3.14159;
const double sigma=5.67e-8;
const double b=2.898e-3;
const double c=3e8;
const double G=6.674e-11;
const double solar_mass=1.989e30;
const double solar_L = 3.828e26;

//Star data structure
struct Star{
    double R, T, L, lambda, F, d, P, i_mass, r_mass;
    string name, r_type, status, evo_status;
    double schw_R, redshift_F, redshift_T;
    double  age_myr, main_seq_life;
    int evo_stage;
};


void analyzeStar(Star &s){
    s.L=4*pi*s.R*s.R*sigma*pow(s.T, 4);
    s.lambda=b/s.T;
    s.F=s.L/(4*pi*s.d*s.d);
    s.P=s.F/c;
    s.schw_R=(2 * G *(s.i_mass*solar_mass)) / (c * c);

    if(s.R <= s.schw_R) {
        s.redshift_F = 0;
        s.redshift_T = 0;
        s.status = "Black hole - no escape";     
    } else {
        s.redshift_F = sqrt(1.0 - (s.schw_R / s.R));
        s.redshift_T = s.T * s.redshift_F;
        if(s.redshift_F > 0.01)
            s.status = "Photon escapes - redshifted";
        else
            s.status = "Extreme redshift - photon barely escapes";
    }    
}

void classifier(Star &w){
    if(w.i_mass<0.87)
        w.r_mass=-1;
    else if(w.i_mass<=8)
        w.r_mass=0.109*w.i_mass+0.394;
    else
        w.r_mass=0.15*w.i_mass; 
    if(w.r_mass<0)
        w.r_type="Too small - outlives the universe";
    else if(w.r_mass<1.4)
        w.r_type="White Dwarf";
    else if(w.r_mass<=3.0)
        w.r_type="Neutron Star";
    else
        w.r_type="Black Hole";                
}

void inputStar(vector<Star>& S, int n){
    int i;
    for(i=0; i<n; i++){
        cout<<"Enter the star's name: "<<" ";
        getline(cin, S[i].name);

        cout<<"Input the star's radius (m): "<<" ";
        cin>>S[i].R;

        cout<<"Input the star's temperature (K): "<<" ";
        cin>>S[i].T;

        cout<<"Input the distance: (m)"<<" ";
        cin>>S[i].d;

        cout<<"Input the star's initial mass: (solar masses)"<<" ";
        cin>>S[i].i_mass;

        cin.ignore();

        analyzeStar(S[i]);
        classifier(S[i]);
    }    
}

void sortStars(vector<Star>& S){
    cout<< "\nSort by:" << endl;
    cout<< "1. Luminosity" << endl;
    cout<< "2. Temperature" << endl;
    cout<< "3. Schwarzschild Radius" << endl;
    cout<< "4. Redshift Factor" << endl;
    cout<< "5. Peak Wavelenght" << endl;
    int choice;
    cin >> choice;

    if(choice == 1)
        sort(S.begin(), S.end(), [](const Star& a, const Star& y){
            return a.L > y.L; });
    else if(choice == 2)
        sort(S.begin(), S.end(), [](const Star& a, const Star& b){
            return a.T > b.T; });
    else if(choice == 3)
        sort(S.begin(), S.end(), [](const Star& a, const Star& b){
            return a.schw_R > b.schw_R; });
    else if(choice == 4)
        sort(S.begin(), S.end(), [](const Star& a, const Star& b){
            return a.redshift_F < b.redshift_F; });
    else if (choice == 5)
        sort(S.begin(), S.end(), [](const Star& a, const Star& b){
            return a.lambda > b.lambda; }); 
    else
        cout << "Invalid choice, no sort applied." << endl;
}

double mainSeqLifetime(Star& s){
    double L_solar=s.L/3.828e26;
    double M_solar=s.i_mass;
    if (L_solar == 0)
        return 0;
    return (M_solar/L_solar)*10000;
}

void evolve(Star& s, double age, int stage){
    if(stage==2){
        cout<< "\nStage 2 | " <<s.r_type<<" |Age: "<<age<< "Myr"<<endl;
        cout<< "Evolution complete." <<endl;
        return;
    }
    else if (stage == 1) {
        if (s.i_mass < 0.5) {
            s.evo_status = "Fading Red Dwarf - never leaves main sequence";
            cout << " Stage 1 | " << s.evo_status
                << " | Age: " << age << " Myr" << endl;
            evolve(s, age, 2);
            return;
        }
        s.evo_status = "Red Giant";
        double post_ms = mainSeqLifetime(s) * 0.1;
        cout << "Stage 1 | " << s.evo_status
            << " | Age: " << age << " Myr" << endl;
        evolve(s, age + post_ms, 2);
        return;
    }
    else if (stage == 0) {
        s.evo_status = "Main sequence";
        double ms_life = mainSeqLifetime(s);
        cout << "\nStage " << stage << " | " << s.evo_status
            << " | Age: " << age << " Myr | MS Lifetime: " << ms_life << endl;
        evolve(s, age + ms_life, 1);
    }
}

void outputStar(vector<Star>& S, int n){
    cout<<"---RESULTS---"<<endl;
    for(int i=0; i<n; i++){
        cout<<S[i].name<<":"<<endl;
        cout<<"-Luminosity: "<<S[i].L<<" "<<"W"<<endl;
        cout<<"-Peak wavelenght: "<<S[i].lambda<<" "<<"m"<<endl;
        cout<<"-Flux: "<<S[i].F<<" W/m^2"<<endl;
        cout<<"-Radiation Pressure: "<<S[i].P<<" Pa"<<endl;
        if(S[i].lambda < 4.5e-7)
            cout << "-Color: Blue/Ultraviolet" << endl;
        else if(S[i].lambda < 5.5e-7)
            cout << "-Color: Yellow/Green" << endl;
        else if(S[i].lambda < 7.0e-7)
            cout << "-Color: Orange/Red" << endl;
        else
            cout << "-Color: Infrared - invisible" << endl;
        cout<<"-"<<S[i].r_type<<endl; 
        if(S[i].P>1e-8)
            cout<<" -Status: DETECTED"<<endl;
        else    
            cout<<" -Status: Below detection limit"<<endl;
        
        cout<<"-Schwarzschild Radius: " << S[i].schw_R << " m" << endl;
        cout<<"-Gravitational Redshift Factor: " << S[i].redshift_F<<endl;
        cout<<"-Observed Temperature: " <<S[i].redshift_T<<" K"<<endl;
        cout<<"-Photon Status: "<<S[i].status<<endl;

        cout << "\n ---Evolution---" << endl;
            evolve(S[i], 0.0, 0);
    }    
}


int main(){
    int n;

    //Menu:
    cout << "=== Stelar Analysis Engine ===" << endl;
    cout << "1. Analyze new catalogue" << endl;
    cout << "2.Load previous results" << endl;
    cout << "3. Exit";

    int menu;
    cin >> menu;
    cin.ignore();
    if (menu == 1)
        cout << "Goodbye!";
    else {
        cout << "Number of stars: ";
        cin >> n;
        vector<Star> S(n);
        cin.ignore();
        for (int i = 0; i < n; i++)
            sortStars(S);
        inputStar(S, n);
        outputStar(S, n);
    }
    return 0;
}